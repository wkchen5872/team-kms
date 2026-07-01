/** Build an McpServer whose tools are bound to a user-scoped VaultFS. */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PostgresVaultFS } from "@team-kms/shared";
import { guide, listKnowledgeBases, createKnowledgeBase, WikiTools } from "./tools.js";

type Text = { content: { type: "text"; text: string }[] };
const text = (s: string): Text => ({ content: [{ type: "text", text: s }] });

export function buildMcpServer(fs: PostgresVaultFS): McpServer {
  const server = new McpServer(
    { name: "Team KMS Wiki", version: "0.1.0" },
    {
      instructions:
        "A knowledge workspace where you compile a structured wiki from raw source documents. " +
        "Sources live at `/` (read-only); wiki pages you author live at `/wiki/`. " +
        "Call the `guide` tool first — it explains the wiki structure (overview / concepts / entities / log), " +
        "the required frontmatter, the mandatory visual element per page, citation rules, and the " +
        "ingest / answer / lint workflows.",
    },
  );

  const withKb = async (slug: string, fn: (t: WikiTools) => Promise<string>): Promise<Text> => {
    const kb = await fs.resolveKb(slug);
    if (!kb) return text(`Knowledge base '${slug}' not found.`);
    return text(await fn(new WikiTools(fs, kb)));
  };

  server.registerTool(
    "guide",
    {
      description:
        "Get started with the wiki. Call this first to learn how the knowledge vault works — " +
        "the wiki structure (overview / concepts / entities / log), writing standards, citation " +
        "rules, the reference graph, and the core workflows — and to see your available knowledge bases.",
    },
    async () => text(await guide(fs)),
  );

  server.registerTool(
    "list_knowledge_bases",
    {
      description:
        "List the user's knowledge bases with their names and slugs.\n\n" +
        "Every other tool takes a `knowledge_base` slug — call this first to discover the valid " +
        "slugs, or whenever you need to confirm which knowledge bases exist.",
    },
    async () => text(await listKnowledgeBases(fs)),
  );

  server.registerTool(
    "create_knowledge_base",
    {
      description:
        "Create a new knowledge base and scaffold starter `/wiki/overview.md` and `/wiki/log.md` " +
        "pages. Returns the new slug — use it as `knowledge_base` with the other tools.",
      inputSchema: { name: z.string(), description: z.string().optional() },
    },
    async ({ name, description }) => text(await createKnowledgeBase(fs, name, description ?? "")),
  );

  server.registerTool(
    "search",
    {
      description:
        "Browse or search a knowledge base. Sources (raw documents) live at `/`; wiki pages live at `/wiki/`.\n\n" +
        "Modes:\n" +
        "- list: browse files and folders\n" +
        "- search: keyword search across document content (chunk-level, with page numbers)\n" +
        "- references: query the citation/link graph for a document\n\n" +
        "References-mode examples:\n" +
        '- search(mode="references", path="/wiki/concepts/scaling.md") — what it cites + what links to it\n' +
        '- search(mode="references", path="paper.pdf") — which wiki pages cite this source\n' +
        '- search(mode="references", query="uncited") — sources with no wiki citations\n' +
        '- search(mode="references", query="stale") — pages flagged potentially stale\n\n' +
        "Scope with `path`: `*` (everything), `/wiki/**` (wiki only), `*.pdf` (PDFs), `/` (sources). " +
        "Filter with `tags`.",
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
      description:
        "Read document content. Read a single file by `path`, or a glob pattern to batch-read " +
        "multiple files. For paginated sources (PDF / Office), pass `pages` (e.g. \"1-10\" or \"3,5,7\") " +
        "to read specific pages. Reading a wiki page also shows its backlinks (which pages reference it).",
      inputSchema: { knowledge_base: z.string(), path: z.string(), pages: z.string().optional() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.read(a.path, a.pages)),
  );

  server.registerTool(
    "create",
    {
      description:
        "Create a new wiki page, note, or asset. Wiki pages go under `/wiki/` and should cite their " +
        "sources with markdown footnotes (e.g. `[^1]: paper.pdf, p.3`). If markdown content has no YAML " +
        "frontmatter, this tool adds it from `title`, `tags`, and `date_str`.\n\n" +
        "You can also create SVG diagrams and CSV data as wiki assets, e.g.\n" +
        '- create(path="/wiki/", title="architecture.svg", content="<svg>...</svg>", tags=["diagram"])\n' +
        "and embed them in pages via `![Architecture](architecture.svg)`.\n\n" +
        "Rejects if the page already exists — use overwrite=true to replace, or the `edit` tool to modify.",
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
      description:
        "Replace exact text in an existing wiki page or note — like find-and-replace. Provide the " +
        "exact text to find (`old_text`) and the replacement (`new_text`). The match must be unique; " +
        "if multiple matches are found, include more surrounding context. Read the page first to see " +
        "its current content.",
      inputSchema: { knowledge_base: z.string(), path: z.string(), old_text: z.string(), new_text: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.edit(a.path, a.old_text, a.new_text)),
  );

  server.registerTool(
    "append",
    {
      description:
        "Append content to the end of an existing wiki page or note — for adding new sections, log " +
        "entries, or findings without rewriting the whole document. Trailing footnote definitions are " +
        "kept at EOF, and colliding footnote ids are renumbered.",
      inputSchema: { knowledge_base: z.string(), path: z.string(), content: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.append(a.path, a.content)),
  );

  server.registerTool(
    "lint",
    {
      description:
        "Run deterministic hygiene checks on a knowledge base: required frontmatter, dangling wiki " +
        "links, orphan pages, uncited sources, and stale pages. Returns issues grouped as errors and " +
        "warnings. Run after a batch of edits; fix all errors before relying on the wiki, then append " +
        "a lint entry to `/wiki/log.md`.",
      inputSchema: { knowledge_base: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.lint()),
  );

  server.registerTool(
    "delete",
    {
      description:
        "Delete (archive) a wiki page, note, or source by `path` (single file or glob pattern). " +
        "`/wiki/overview.md` and `/wiki/log.md` are protected and cannot be deleted.",
      inputSchema: { knowledge_base: z.string(), path: z.string() },
    },
    async (a) => withKb(a.knowledge_base, (t) => t.deleteDoc(a.path)),
  );

  return server;
}
