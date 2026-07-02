/**
 * Ingest a source file: text/markdown is indexed directly; PDF/Office is
 * uploaded to S3, extracted via the converter, then stored as pages + chunks.
 */
import { createHash } from "node:crypto";
import type { PostgresVaultFS, S3Service } from "@team-kms/shared";
import type { ConverterClient } from "./converter-client.js";
import { ocrImageBytes, ocrPageImages, type OcrProvider } from "./ocr.js";
import { enqueue } from "./jobs.js";

const TEXT_TYPES = new Set(["md", "txt"]);
// Raster images: stored as-is, never sent to the PDF/Office converter (which
// would reject them). OCR, if configured, adds searchable text at finalize.
const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
// Office/PDF go through the converter; images through OCR. Both are re-extractable.
const OFFICE_PDF_TYPES = new Set(["pdf", "pptx", "ppt", "docx", "doc", "xls", "xlsx"]);
/** Types whose content is derived by extraction/OCR (so re-extract is meaningful). */
export const EXTRACTABLE_TYPES = new Set([...OFFICE_PDF_TYPES, ...IMAGE_TYPES]);
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export interface IngestInput {
  kbId: string;
  filename: string;
  /** lowercase extension without dot, e.g. "pdf", "md" */
  fileType: string;
  bytes: Buffer;
  title?: string;
  tags?: string[];
  dirPath?: string;
}

export interface IngestDeps {
  fs: PostgresVaultFS;
  s3: S3Service;
  converter: ConverterClient;
  /** Optional image OCR; null/omitted = no OCR (backend stays zero-LLM). */
  ocr?: OcrProvider | null;
}

function titleFrom(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export async function ingestSource(
  deps: IngestDeps,
  input: IngestInput,
): Promise<{ id: string; filename: string; path: string }> {
  const { fs, s3, converter, ocr } = deps;
  const title = input.title ?? titleFrom(input.filename);
  const dirPath = input.dirPath ?? "/";

  // Dedup: identical raw bytes already ingested in this KB → return the existing doc,
  // skip S3 upload and extraction. Scoped per KB; same bytes in another KB are allowed.
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");
  const existing = await fs.findByFileHash(input.kbId, fileHash);
  if (existing) return existing;

  if (TEXT_TYPES.has(input.fileType)) {
    return fs.createDocument(
      input.kbId,
      input.filename,
      title,
      dirPath,
      input.fileType,
      input.bytes.toString("utf8"),
      input.tags ?? [],
      undefined,
      undefined,
      "text",
      "raw",
      fileHash,
    );
  }

  // Binary source: pending doc → S3 → (converter | image branch) → finalize.
  const doc = await fs.createPendingDocument(
    input.kbId,
    input.filename,
    title,
    dirPath,
    input.fileType,
    undefined,
    input.bytes.length,
    fileHash,
  );
  const key = `${fs.userId}/${doc.id}/source.${input.fileType}`;
  await s3.uploadBytes(key, input.bytes, MIME[input.fileType] ?? "application/octet-stream");

  if (IMAGE_TYPES.has(input.fileType)) {
    // Raster image: skip the converter entirely; OCR (if enabled) → content.
    const ocrText = await ocrImageBytes(ocr ?? null, input.bytes, input.fileType);
    await fs.finalizeImageDocument(doc.id, input.kbId, ocrText);
    return doc;
  }

  const sourceUrl = await s3.generatePresignedGet(key);
  const pages = await converter.extract(sourceUrl, input.fileType);
  await ocrPageImages(ocr ?? null, pages);
  await fs.finalizeExtractedDocument(doc.id, input.kbId, pages);
  return doc;
}

export interface IngestResult {
  id: string;
  filename: string;
  path: string;
  status: "ready" | "pending";
}

/**
 * Async ingest for uploads: does the fast part inline (dedup, create doc, upload
 * to S3) and hands binary extraction to the single-threaded job queue. Returns
 * immediately so uploads never block on — or saturate — the converter; the queue
 * runs one document at a time and marks failures on `documents.status`.
 */
export async function ingestAsync(
  deps: Pick<IngestDeps, "fs" | "s3">,
  input: IngestInput,
): Promise<IngestResult> {
  const { fs, s3 } = deps;
  const title = input.title ?? titleFrom(input.filename);
  const dirPath = input.dirPath ?? "/";

  const fileHash = createHash("sha256").update(input.bytes).digest("hex");
  const existing = await fs.findByFileHash(input.kbId, fileHash);
  if (existing) return { ...existing, status: "ready" };

  if (TEXT_TYPES.has(input.fileType)) {
    const doc = await fs.createDocument(
      input.kbId, input.filename, title, dirPath, input.fileType,
      input.bytes.toString("utf8"), input.tags ?? [], undefined, undefined, "text", "raw", fileHash,
    );
    return { ...doc, status: "ready" };
  }

  const doc = await fs.createPendingDocument(
    input.kbId, input.filename, title, dirPath, input.fileType, undefined, input.bytes.length, fileHash,
  );
  const key = `${fs.userId}/${doc.id}/source.${input.fileType}`;
  await s3.uploadBytes(key, input.bytes, MIME[input.fileType] ?? "application/octet-stream");
  enqueue(doc.id); // extraction / image / OCR / finalize / failure-marking all happen in the queue
  return { ...doc, status: "pending" };
}
