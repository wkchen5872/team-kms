import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresVaultFS, s3FromConfig, serviceExecute, closePool, type S3Service } from "@team-kms/shared";
import { app as converterApp } from "@team-kms/converter/app";
import { makePdf } from "@team-kms/converter/test-pdf";
import { HttpConverterClient } from "./converter-client.js";
import { ingestSource, type IngestDeps } from "./ingest.js";

const userId = randomUUID();
let deps: IngestDeps;
let s3: S3Service;
let kbId: string;

describe.skipIf(!process.env.DATABASE_URL)("ingestSource", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@test.local`]);
    const fs = new PostgresVaultFS(userId);
    kbId = (await fs.createKnowledgeBase("Ingest KB")).id;
    s3 = s3FromConfig();
    await s3.ensureBucket();
    const converter = new HttpConverterClient(
      "http://converter",
      process.env.CONVERTER_SECRET ?? "",
      // Hono's app.request matches (url, init) → Promise<Response>.
      converterApp.request.bind(converterApp) as unknown as typeof fetch,
    );
    deps = { fs, s3, converter };
  });

  afterAll(async () => {
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await closePool();
  });

  it("indexes a markdown source directly (no converter)", async () => {
    await ingestSource(deps, {
      kbId,
      filename: "notes.md",
      fileType: "md",
      bytes: Buffer.from("The qwarvex index keeps rising steadily. ".repeat(6)),
    });
    const hits = await deps.fs.searchChunks(kbId, "qwarvex", 10);
    expect(hits.some((h) => h.filename === "notes.md")).toBe(true);
  });

  it("ingests a PDF end-to-end: S3 → converter → pages → chunks", async () => {
    const doc = await ingestSource(deps, {
      kbId,
      filename: "report.pdf",
      fileType: "pdf",
      // Long enough to clear the chunker's ~32-token minimum.
      bytes: makePdf("Zoltaxian trade flows expanded across the outer rim systems this quarter. ".repeat(3)),
    });
    const pages = await deps.fs.getAllPages(doc.id);
    expect(pages.length).toBe(1);
    const hits = await deps.fs.searchChunks(kbId, "Zoltaxian", 10);
    expect(hits.some((h) => h.filename === "report.pdf")).toBe(true);
  });
});
