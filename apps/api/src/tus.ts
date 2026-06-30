/**
 * Minimal TUS 1.0 resumable-upload core, ported from llmwiki `api/infra/tus.py`.
 * In-memory buffering (≤200 MB cap); finalize validates the file signature.
 */
import { randomUUID } from "node:crypto";

export const TUS_VERSION = "1.0.0";
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export interface Upload {
  id: string;
  offset: number;
  length: number;
  filename: string;
  fileType: string;
  kbSlug: string;
  userId: string;
  data: Buffer;
  docId?: string;
}

const uploads = new Map<string, Upload>();

export class OffsetMismatch extends Error {
  constructor(public expected: number) {
    super(`offset mismatch, expected ${expected}`);
  }
}

export function decodeMetadata(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split(" ");
    if (k) out[k] = v ? Buffer.from(v, "base64").toString("utf8") : "";
  }
  return out;
}

export function createUpload(input: {
  length: number;
  filename: string;
  kbSlug: string;
  userId: string;
}): Upload {
  if (!Number.isFinite(input.length) || input.length < 0) throw new Error("invalid Upload-Length");
  if (input.length > MAX_UPLOAD_BYTES) throw new Error(`exceeds ${MAX_UPLOAD_BYTES} bytes`);
  const up: Upload = {
    id: randomUUID(),
    offset: 0,
    length: input.length,
    filename: input.filename,
    fileType: (input.filename.split(".").pop() ?? "").toLowerCase(),
    kbSlug: input.kbSlug,
    userId: input.userId,
    data: Buffer.alloc(0),
  };
  uploads.set(up.id, up);
  return up;
}

export function getUpload(id: string): Upload | undefined {
  return uploads.get(id);
}

export function deleteUpload(id: string): void {
  uploads.delete(id);
}

/** Append a chunk at `offset`; returns the new offset. */
export function appendChunk(id: string, offset: number, chunk: Buffer): number {
  const up = uploads.get(id);
  if (!up) throw new Error("upload not found");
  if (offset !== up.offset) throw new OffsetMismatch(up.offset);
  if (up.offset + chunk.length > up.length) throw new Error("chunk exceeds declared length");
  up.data = Buffer.concat([up.data, chunk]);
  up.offset += chunk.length;
  return up.offset;
}

const SIGNATURES: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
};

/** True if the bytes match the declared type's magic number (or the type has none). */
export function validateSignature(bytes: Buffer, fileType: string): boolean {
  const sigs = SIGNATURES[fileType];
  if (!sigs) return true; // text / unknown → no signature to enforce
  return sigs.some((sig) => sig.every((b, i) => bytes[i] === b));
}
