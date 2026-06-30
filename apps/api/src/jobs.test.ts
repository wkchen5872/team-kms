import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresVaultFS, s3FromConfig, serviceQueryRow, serviceExecute, closePool } from "@team-kms/shared";
import { app as converterApp } from "@team-kms/converter/app";
import { makePdf } from "@team-kms/converter/test-pdf";
import { HttpConverterClient } from "./converter-client.js";
import { setProcessor, recoverStuckJobs, extractionProcessor } from "./jobs.js";

const userId = randomUUID();
let fs: PostgresVaultFS;
let kbId: string;

async function waitStatus(docId: string, ms = 15_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const row = await serviceQueryRow<{ status: string }>("SELECT status FROM documents WHERE id = $1", [docId]);
    if (row && (row.status === "ready" || row.status === "failed")) return row.status;
    await new Promise((r) => setTimeout(r, 200));
  }
  return "timeout";
}

describe.skipIf(!process.env.DATABASE_URL)("async extraction jobs + recovery", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@test.local`]);
    fs = new PostgresVaultFS(userId);
    kbId = (await fs.createKnowledgeBase("Jobs KB")).id;
    const s3 = s3FromConfig();
    await s3.ensureBucket();
    const converter = new HttpConverterClient(
      "http://converter",
      process.env.CONVERTER_SECRET ?? "",
      converterApp.request.bind(converterApp) as unknown as typeof fetch,
    );
    setProcessor(extractionProcessor(s3, converter));
  });

  afterAll(async () => {
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await closePool();
  });

  it("recovers a stuck 'processing' document and extracts it to ready", async () => {
    // Simulate an interrupted ingest: pending doc + source already in S3, left stuck.
    const doc = await fs.createPendingDocument(kbId, "async.pdf", "Async", "/", "pdf");
    const key = `${userId}/${doc.id}/source.pdf`;
    await s3FromConfig().uploadBytes(
      key,
      // Long enough to clear the chunker's ~32-token minimum.
      makePdf("Zoltaxian async pipeline recovered the document after a restart cleanly. ".repeat(3)),
      "application/pdf",
    );
    await serviceExecute("UPDATE documents SET status = 'processing' WHERE id = $1", [doc.id]);

    const recovered = await recoverStuckJobs();
    expect(recovered).toBeGreaterThanOrEqual(1);

    expect(await waitStatus(doc.id)).toBe("ready");
    const hits = await fs.searchChunks(kbId, "Zoltaxian", 10);
    expect(hits.some((h) => h.filename === "async.pdf")).toBe(true);
  });
});
