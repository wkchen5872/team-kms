import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PostgresVaultFS, serviceExecute, closePool } from "@team-kms/shared";
import { buildMcpServer } from "./server.js";

const userId = randomUUID();
let client: Client;

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[] };
  return res.content.map((c) => c.text).join("\n");
}

describe.skipIf(!process.env.DATABASE_URL)("MCP tools over the protocol", () => {
  beforeAll(async () => {
    await serviceExecute("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@test.local`]);
    const server = buildMcpServer(new PostgresVaultFS(userId));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientT);
  });

  afterAll(async () => {
    await client.close();
    await serviceExecute("DELETE FROM knowledge_bases WHERE user_id = $1", [userId]);
    await serviceExecute("DELETE FROM users WHERE id = $1", [userId]);
    await closePool();
  });

  it("creates a KB and lists it", async () => {
    expect(await call("create_knowledge_base", { name: "MCP KB" })).toContain("mcp-kb");
    expect(await call("list_knowledge_bases")).toContain("mcp-kb");
  });

  it("guide returns help text", async () => {
    expect(await call("guide")).toContain("Team KMS Wiki");
  });

  it("lists scaffolded wiki pages", async () => {
    const out = await call("search", { knowledge_base: "mcp-kb", mode: "list", path: "/wiki/**" });
    expect(out).toContain("overview.md");
    expect(out).toContain("log.md");
  });

  it("Claude writes a wiki page; reference edge + backlink appear", async () => {
    const out = await call("create", {
      knowledge_base: "mcp-kb",
      title: "attention",
      path: "/wiki/concepts/",
      // Multi-line so the auto-frontmatter description (first line) doesn't
      // duplicate the body phrase we later edit.
      content:
        "Attention is the core mechanism of transformers.\n\nIt scales quadratically in sequence length. See the hub at [overview](/wiki/overview.md).",
      tags: ["concept", "transformers"],
    });
    expect(out).toContain("/wiki/concepts/attention.md");

    const refs = await call("search", { knowledge_base: "mcp-kb", mode: "references", path: "/wiki/concepts/attention.md" });
    expect(refs).toContain("overview.md");

    const overview = await call("read", { knowledge_base: "mcp-kb", path: "/wiki/overview.md" });
    expect(overview).toContain("Referenced by");
  });

  it("keyword search finds the new page", async () => {
    const out = await call("search", { knowledge_base: "mcp-kb", mode: "search", query: "quadratically" });
    expect(out).toContain("attention.md");
  });

  it("edits and appends to a page", async () => {
    const edited = await call("edit", {
      knowledge_base: "mcp-kb",
      path: "/wiki/concepts/attention.md",
      old_text: "scales quadratically in sequence length",
      new_text: "scales quadratically with the number of tokens",
    });
    expect(edited).toContain("Replaced 1 occurrence");
    const appended = await call("append", {
      knowledge_base: "mcp-kb",
      path: "/wiki/concepts/attention.md",
      content: "## Addendum\n\nFlash attention reduces memory.",
    });
    expect(appended).toContain("Appended");
  });

  it("lint flags the orphan page", async () => {
    const out = await call("lint", { knowledge_base: "mcp-kb" });
    expect(out).toContain("attention.md");
    expect(out.toLowerCase()).toContain("orphan");
  });

  it("protects core pages from deletion", async () => {
    expect(await call("delete", { knowledge_base: "mcp-kb", path: "/wiki/overview.md" })).toContain("Protected");
    expect(await call("delete", { knowledge_base: "mcp-kb", path: "/wiki/concepts/attention.md" })).toContain("Deleted");
  });
});
