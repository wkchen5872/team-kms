import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresVaultFS, DuplicateDocumentError } from "./vaultfs.js";
import { serviceExecute, closePool } from "./db.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // ambient env
}

const userId = randomUUID();
let fs: PostgresVaultFS;
let kbId: string;

describe.skipIf(!process.env.DATABASE_URL)("PostgresVaultFS", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@test.local`]);
    fs = new PostgresVaultFS(userId);
    const kb = await fs.createKnowledgeBase("Vault Test KB");
    kbId = kb.id;
  });

  afterAll(async () => {
    // documents.user_id has no ON DELETE CASCADE, so drop the KB first
    // (cascades documents/chunks/refs) before removing the user.
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await closePool();
  });

  it("scaffolds overview.md and log.md on KB creation", async () => {
    const docs = await fs.listDocuments(kbId);
    const names = docs.map((d) => d.filename).sort();
    expect(names).toEqual(["log.md", "overview.md"]);
    expect(docs.every((d) => d.path === "/wiki/")).toBe(true);
  });

  it("resolves the KB by slug and lists it", async () => {
    const resolved = await fs.resolveKb("vault-test-kb");
    expect(resolved?.id).toBe(kbId);
    const list = await fs.listKnowledgeBases();
    expect(list.some((k) => k.slug === "vault-test-kb")).toBe(true);
  });

  it("creates a source doc and finds it via PGroonga search", async () => {
    const content = "The zoltaxian protocol governs interstellar trade. ".repeat(6);
    await fs.createDocument(kbId, "trade.md", "Trade", "/", "md", content, ["source"]);
    const hits = await fs.searchChunks(kbId, "zoltaxian", 10);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((h) => h.filename === "trade.md")).toBe(true);
  });

  it("scopes search by path filter", async () => {
    const sourcesOnly = await fs.searchChunks(kbId, "zoltaxian", 10, "wiki");
    expect(sourcesOnly.length).toBe(0); // the doc lives at "/", not "/wiki/"
  });

  it("rejects a duplicate (kb, path, filename)", async () => {
    await expect(fs.createDocument(kbId, "trade.md", "Trade", "/", "md", "again", ["source"])).rejects.toBeInstanceOf(
      DuplicateDocumentError,
    );
  });

  it("records and reads reference edges", async () => {
    const docs = await fs.listDocuments(kbId);
    const overview = docs.find((d) => d.filename === "overview.md")!;
    const log = docs.find((d) => d.filename === "log.md")!;
    await fs.upsertReference(overview.id, log.id, kbId, "links_to", null);

    const backlinks = await fs.getBacklinks(log.id);
    expect(backlinks.some((b) => b.filename === "overview.md")).toBe(true);
    const forward = await fs.getForwardReferences(overview.id);
    expect(forward.some((f) => f.filename === "log.md")).toBe(true);
  });

  it("re-chunks on update so new content is searchable", async () => {
    const docs = await fs.listDocuments(kbId);
    const overview = docs.find((d) => d.filename === "overview.md")!;
    await fs.updateDocument(overview.id, "Updated with the qornblat keyword. ".repeat(6), { title: "Overview" });
    const hits = await fs.searchChunks(kbId, "qornblat", 10);
    expect(hits.some((h) => h.filename === "overview.md")).toBe(true);
  });

  it("archives a document so it leaves the active listing", async () => {
    const before = await fs.listDocuments(kbId);
    const trade = before.find((d) => d.filename === "trade.md")!;
    const n = await fs.archiveDocuments([trade.id]);
    expect(n).toBe(1);
    const after = await fs.listDocuments(kbId);
    expect(after.some((d) => d.filename === "trade.md")).toBe(false);
  });
});
