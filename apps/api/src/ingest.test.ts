import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresVaultFS, s3FromConfig, serviceExecute, closePool, type S3Service } from "@team-kms/shared";
import { app as converterApp } from "@team-kms/converter/app";
import { makePdf } from "@team-kms/converter/test-pdf";
import { HttpConverterClient } from "./converter-client.js";
import { ingestSource, ingestAsync, type IngestDeps } from "./ingest.js";

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

  it("deduplicates re-uploads by file hash within a KB, but not across KBs", async () => {
    const bytes = Buffer.from("Dedup me: the plithtavian ledger balanced at last. ".repeat(6));
    const first = await ingestSource(deps, { kbId, filename: "dedup-a.md", fileType: "md", bytes });
    // Same bytes, different filename → deduped back to the first doc (hash-based, not name-based).
    const again = await ingestSource(deps, { kbId, filename: "dedup-b.md", fileType: "md", bytes });
    expect(again.id).toBe(first.id);
    // Same bytes in a different KB → a new document.
    const kb2 = (await deps.fs.createKnowledgeBase("Ingest KB 2")).id;
    const other = await ingestSource(deps, { kbId: kb2, filename: "dedup-a.md", fileType: "md", bytes });
    expect(other.id).not.toBe(first.id);
  });

  it("uploads a raster image without the converter and converges to ready", async () => {
    // A 1x1 PNG — valid image bytes, never sent to the PDF/Office converter.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const doc = await ingestSource(deps, { kbId, filename: "diagram.png", fileType: "png", bytes: png });
    // It is a normal (non-asset) source doc, visible in the grid, and ready.
    const docs = await deps.fs.listDocuments(kbId);
    const row = docs.find((d) => d.id === doc.id);
    expect(row?.status).toBe("ready");
  });

  it("finalizeExtractedDocument stores embedded images as assets + elements", async () => {
    const pngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const pending = await deps.fs.createPendingDocument(kbId, "figs.pdf", "figs", "/", "pdf", undefined, 123, "hash-figs-1");
    await deps.fs.finalizeExtractedDocument(pending.id, kbId, [
      { page: 1, content: "Intro\n\n![image](odl-image:img-p1-1.png)", images: [{ id: "img-p1-1.png", dataBase64: pngB64, format: "png" }] },
    ]);
    const pages = await deps.fs.getAllPages(pending.id);
    const elements = (pages[0] as { elements?: { images?: { id: string; src: string }[] } }).elements;
    expect(elements?.images?.length).toBe(1);
    const assetId = elements!.images![0]!.id;
    expect(pages[0]!.content).toContain(`asset:${assetId}`);
    expect(pages[0]!.content).not.toContain("odl-image:");
    // asset bytes are retrievable from Storage
    const bytes = await deps.fs.loadAssetBytes(assetId);
    expect(bytes && bytes.length).toBeGreaterThan(0);
    // asset docs are hidden from the grid
    const docs = await deps.fs.listDocuments(kbId);
    expect(docs.some((d) => d.id === assetId)).toBe(false);
  });

  it("ingestAsync returns ready for text and pending (enqueued) for binary", async () => {
    const md = await ingestAsync(
      { fs: deps.fs, s3 },
      { kbId, filename: "async-note.md", fileType: "md", bytes: Buffer.from("The async note body indexes fine. ".repeat(6)) },
    );
    expect(md.status).toBe("ready");
    const pdf = await ingestAsync(
      { fs: deps.fs, s3 },
      { kbId, filename: "async.pdf", fileType: "pdf", bytes: makePdf("async pdf body across the rim ".repeat(4)) },
    );
    expect(pdf.status).toBe("pending"); // handed to the queue, not extracted inline
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
