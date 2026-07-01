/**
 * In-process extraction job queue with status tracking + startup recovery,
 * ported from llmwiki's hosted OCR processing. Single-threaded drain keeps the
 * "one document at a time" guarantee. Status lives on `documents.status`
 * (pending → processing → ready | failed).
 */
import {
  PostgresVaultFS,
  serviceQuery,
  serviceQueryRow,
  serviceExecute,
  type S3Service,
} from "@team-kms/shared";
import type { ConverterClient } from "./converter-client.js";

export type Processor = (docId: string) => Promise<void>;

let processor: Processor | null = null;
const queue: string[] = [];
let draining = false;

export function setProcessor(p: Processor): void {
  processor = p;
}

export function enqueue(docId: string): void {
  queue.push(docId);
  void drain();
}

async function drain(): Promise<void> {
  if (draining || !processor) return;
  draining = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await processor(id);
      } catch {
        // processor is responsible for recording failure status
      }
    }
  } finally {
    draining = false;
  }
}

/** Re-enqueue documents left in pending/processing (e.g. after a restart). */
export async function recoverStuckJobs(): Promise<number> {
  const rows = await serviceQuery<{ id: string }>(
    "SELECT id FROM documents WHERE status IN ('pending', 'processing') ORDER BY created_at",
  );
  for (const r of rows) enqueue(r.id);
  return rows.length;
}

/** The real processor: presign the S3 source, extract, and finalize. */
export function extractionProcessor(s3: S3Service, converter: ConverterClient): Processor {
  return async (docId: string) => {
    const doc = await serviceQueryRow<{
      id: string;
      user_id: string;
      knowledge_base_id: string;
      file_type: string;
    }>("SELECT id, user_id, knowledge_base_id, file_type FROM documents WHERE id = $1", [docId]);
    if (!doc) return;
    await serviceExecute("UPDATE documents SET status = 'processing' WHERE id = $1", [docId]);
    try {
      const key = `${doc.user_id}/${docId}/source.${doc.file_type}`;
      const url = await s3.generatePresignedGet(key);
      const pages = await converter.extract(url, doc.file_type);
      await new PostgresVaultFS(doc.user_id).finalizeExtractedDocument(docId, doc.knowledge_base_id, pages);
    } catch (err) {
      // status lives on documents; error_message on the document_raw detail row.
      await serviceExecute("UPDATE documents SET status = 'failed' WHERE id = $1", [docId]);
      await serviceExecute("UPDATE document_raw SET error_message = $2 WHERE document_id = $1", [
        docId,
        String(err).slice(0, 500),
      ]);
    }
  };
}
