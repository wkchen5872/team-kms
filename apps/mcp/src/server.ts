/** Build an McpServer whose tools are bound to a user-scoped VaultFS. */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PostgresVaultFS } from "@team-kms/shared";
import { guide, listKnowledgeBases, createKnowledgeBase, WikiTools } from "./tools.js";

type Text = { content: { type: "text"; text: string }[] };
const text = (s: string): Text => ({ content: [{ type: "text", text: s }] });

export function buildMcpServer(fs: PostgresVaultFS): McpServer {
  const server = new McpServer({ name: "Team KMS Wiki", version: "0.1.0" });

  const withKb = async (slug: string, fn: (t: WikiTools) => Promise<string>): Promise<Text> => {
    const kb = await fs.resolveKb(slug);
    if (!kb) return text(`Knowledge base '${slug}' not found.`);
    return text(await fn(new WikiTools(fs, kb)));
  };

  server.registerTool(
    "guide",
    { description: "Get started: how the knowledge vault works and your available knowledge bases." },
    async () => text(await guide(fs)),
  );

  server.registerTool(
    "list_knowledge_bases",
    { description: "List the user's knowledge bases with names and slugs." },
    async () => text(await listKnowledgeBases(fs)),
  );

  server.registerTool(
    "create_knowledge_base",
    {
      description: "Create a knowledge base and scaffold starter overview/log pages.",
      inputSchema: { name: z.string(), description: z.string().optional(), kind: z.string().optional() },
    },
    async ({ name, description, kind }) => text(await createKnowledgeBase(fs, name, description ?? "", kind ?? "wiki")),
  );

  server.registerTool(
    "search",
    {
      description: "Browse (list), keyword-search, or query the reference graph of a knowledge base.",
      inputSchema: {
        knowledge_base: z.string(),
        mode: z.enum(["list", "search", "references"]).optional(),
        query: z.string().optional(),
        path: z.string().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
      },
    },
    async (a) =>
      withKb(a.knowledge_base, (t) =>
        t.search({ mode: a.mode ?? "list", query: a.query, path: a.path, tags: a.tags, limit: a.limit }),
      ),
  );

  server.registerTool(
    "read",
    {
      description: "Read a document (or a glob batch). Use `pages` for a PDF page range.",
      inputSchema: { knowledge_base: z.string(), path: z.string(), pages: z.string().optional() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.read(a.path, a.pages)),
  );

  server.registerTool(
    "create",
    {
      description: "Create a wiki page/note. Adds YAML frontmatter from title/tags/date_str when missing.",
      inputSchema: {
        knowledge_base: z.string(),
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()),
        path: z.string().optional(),
        date_str: z.string().optional(),
        overwrite: z.boolean().optional(),
      },
    },
    async (a) =>
      withKb(a.knowledge_base, (t) =>
        t.create(a.path ?? "/wiki/", a.title, a.content, a.tags, a.date_str ?? "", a.overwrite ?? false),
      ),
  );

  server.registerTool(
    "edit",
    {
      description: "Replace exact text in a wiki page (unique match required).",
      inputSchema: { knowledge_base: z.string(), path: z.string(), old_text: z.string(), new_text: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.edit(a.path, a.old_text, a.new_text)),
  );

  server.registerTool(
    "append",
    {
      description: "Append content to an existing wiki page (keeps trailing footnotes at EOF).",
      inputSchema: { knowledge_base: z.string(), path: z.string(), content: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.append(a.path, a.content)),
  );

  server.registerTool(
    "lint",
    {
      description: "Deterministic hygiene check: frontmatter, dangling links, orphans, uncited sources, stale pages.",
      inputSchema: { knowledge_base: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.lint()),
  );

  server.registerTool(
    "delete",
    {
      description: "Delete (archive) a document. overview.md and log.md are protected.",
      inputSchema: { knowledge_base: z.string(), path: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.deleteDoc(a.path)),
  );

  return server;
}
