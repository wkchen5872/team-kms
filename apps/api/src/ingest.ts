/**
 * Ingest a source file: text/markdown is indexed directly; PDF/Office is
 * uploaded to S3, extracted via the converter, then stored as pages + chunks.
 */
import { createHash } from "node:crypto";
import type { PostgresVaultFS, S3Service } from "@team-kms/shared";
import type { ConverterClient } from "./converter-client.js";

const TEXT_TYPES = new Set(["md", "txt"]);
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
}

function titleFrom(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export async function ingestSource(
  deps: IngestDeps,
  input: IngestInput,
): Promise<{ id: string; filename: string; path: string }> {
  const { fs, s3, converter } = deps;
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

  // Binary source: pending doc → S3 → converter → finalize.
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
  const sourceUrl = await s3.generatePresignedGet(key);
  const pages = await converter.extract(sourceUrl, input.fileType);
  await fs.finalizeExtractedDocument(doc.id, input.kbId, pages);
  return doc;
}
