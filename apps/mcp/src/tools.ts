/**
 * MCP tool handlers, ported from llmwiki `mcp/tools/{guide,list,search,read,write}.py`.
 * Each returns a markdown string. Highlights/image blocks are intentionally
 * dropped (the Chrome-extension features were removed); reading returns text.
 */
import type { PostgresVaultFS, DocumentRow, KnowledgeBaseRow } from "@team-kms/shared";
import { DuplicateDocumentError } from "@team-kms/shared";
import {
  MAX_SEARCH,
  deepLink,
  globMatch,
  resolvePath,
  parsePageRange,
  parseFrontmatter,
  extractDateAndMeta,
  effectiveTags,
  effectiveDate,
  ensureWikiFrontmatter,
  appendMarkdownSection,
  titleToFilename,
  humanizeTitle,
  toDirPath,
} from "./wiki.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseWikiLinks } from "@team-kms/shared";
import { updateReferences, backlinksSummary } from "./references-sync.js";

// The guide is a PROMPT, not code — it steers how Claude compiles the wiki, so
// it lives in prompts/guide.md (repo root) where it can be tuned independently.
function loadGuide(): string {
  try {
    return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "prompts/guide.md"), "utf8");
  } catch {
    return "# Team KMS Wiki\n\nSources at `/`, wiki at `/wiki/`. Tools: search, read, create, edit, append, delete, lint.\n\n## Available Knowledge Bases\n";
  }
}
const GUIDE_TEXT = loadGuide();

const TEXT = (s: string) => s;

export async function guide(fs: PostgresVaultFS): Promise<string> {
  const kbs = await fs.listKnowledgeBases();
  if (!kbs.length) return GUIDE_TEXT + "No knowledge bases yet. Use `create_knowledge_base`.";
  return GUIDE_TEXT + kbs.map((kb) => `- **${kb.name}** (\`${kb.slug}\`)`).join("\n");
}

export async function listKnowledgeBases(fs: PostgresVaultFS): Promise<string> {
  const kbs = await fs.listKnowledgeBases();
  if (!kbs.length) return "No knowledge bases yet. Use `create_knowledge_base`.";
  return kbs.map((kb) => `- **${kb.name}** (\`${kb.slug}\`)`).join("\n");
}

export async function createKnowledgeBase(
  fs: PostgresVaultFS,
  name: string,
  description = "",
): Promise<string> {
  name = name.trim();
  if (!name) return "Error: name is required when creating a knowledge base.";
  if (name.length > 120) return "Error: knowledge base name must be 120 characters or fewer.";
  const kb = await fs.createKnowledgeBase(name, description.trim() || null);
  return (
    `Created knowledge base **${kb.name}** (\`${kb.slug}\`). ` +
    "Starter pages were added at `/wiki/overview.md` and `/wiki/log.md`. " +
    `Use \`knowledge_base="${kb.slug}"\` with the other tools.`
  );
}

const CONTEXT_CHARS = 120;
function snippet(content: string, query: string): string {
  if (!content) return "(empty)";
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return content.slice(0, CONTEXT_CHARS * 2).trim();
  const start = Math.max(0, idx - CONTEXT_CHARS);
  const end = Math.min(content.length, idx + query.length + CONTEXT_CHARS);
  let s = content.slice(start, end).trim();
  if (start > 0) s = "..." + s;
  if (end < content.length) s = s + "...";
  return s;
}

export class WikiTools {
  constructor(
    private readonly fs: PostgresVaultFS,
    private readonly kb: KnowledgeBaseRow,
  ) {}
  private get kbId() {
    return this.kb.id;
  }
  private get slug() {
    return this.kb.slug;
  }

  // ── search ───────────────────────────────────────────────────────
  async search(args: {
    mode: "list" | "search" | "references";
    query?: string;
    path?: string;
    tags?: string[];
    limit?: number;
  }): Promise<string> {
    const path = args.path ?? "*";
    if (args.mode === "list") return this.listDocuments(path, args.tags);
    if (args.mode === "search") {
      if (!args.query) return "search mode requires a query.";
      return this.searchChunks(args.query, path, args.tags, Math.min(args.limit ?? 10, MAX_SEARCH));
    }
    return this.queryReferences(path, args.query ?? "");
  }

  private async listDocuments(target: string, tags?: string[]): Promise<string> {
    let docs = await this.fs.listDocuments(this.kbId);
    const wildcard = ["*", "**", "**/*"].includes(target);
    if (!wildcard) {
      const pat = target.startsWith("/") ? target : `/${target.replace(/^\/+/, "")}`;
      docs = docs.filter((d) => globMatch(d.path + d.filename, pat));
    }
    if (tags?.length) {
      const want = new Set(tags.map((t) => t.toLowerCase()));
      docs = docs.filter((d) => {
        const have = new Set(((d.tags as string[]) ?? []).map((t) => t.toLowerCase()));
        return [...want].every((t) => have.has(t));
      });
    }
    if (!docs.length) return `No matches for \`${target}\` in ${this.slug}.`;
    const sources = docs.filter((d) => !d.path.startsWith("/wiki/"));
    const wiki = docs.filter((d) => d.path.startsWith("/wiki/"));
    const lines = [`**${this.kb.name}**:\n`];
    if (sources.length) {
      lines.push(`**Sources (${sources.length}):**`);
      for (const d of sources) lines.push(`  ${d.path}${d.filename} (${d.file_type})`);
    }
    if (wiki.length) {
      if (sources.length) lines.push("");
      lines.push(`**Wiki (${wiki.length} pages):**`);
      for (const d of wiki) lines.push(`  ${d.path}${d.filename}`);
    }
    return lines.join("\n");
  }

  private pathFilterKey(path: string): "wiki" | "sources" | null {
    if (["*", "**", "**/*"].includes(path)) return null;
    if (path.startsWith("/wiki")) return "wiki";
    if (path === "/" || path === "/*") return "sources";
    return null;
  }

  private async searchChunks(query: string, path: string, tags: string[] | undefined, limit: number): Promise<string> {
    let matches = await this.fs.searchChunks(this.kbId, query, limit, this.pathFilterKey(path));
    if (!["*", "**", "**/*"].includes(path) && (path.includes("*") || path.includes("?"))) {
      const pat = path.startsWith("/") ? path : `/${path.replace(/^\/+/, "")}`;
      matches = matches.filter((m) => globMatch(`${m.path}${m.filename}`, pat));
    }
    if (tags?.length) {
      const want = new Set(tags.map((t) => t.toLowerCase()));
      matches = matches.filter((m) => {
        const have = new Set(((m.tags as string[]) ?? []).map((t) => t.toLowerCase()));
        return [...want].every((t) => have.has(t));
      });
    }
    if (!matches.length) return `No matches for \`${query}\` in ${this.slug}.`;
    const lines = [`**${matches.length} result(s)** for \`${query}\`:\n`];
    for (const m of matches) {
      const page = m.page ? ` (p.${m.page as number})` : "";
      const link = deepLink(this.slug, m.path as string, m.filename as string);
      lines.push(`**${m.path}${m.filename}**${page} — [view](${link})\n\`\`\`\n${snippet(m.content as string, query)}\n\`\`\`\n`);
    }
    return lines.join("\n");
  }

  private async queryReferences(path: string, query: string): Promise<string> {
    if (query === "uncited") {
      const rows = await this.fs.findUncitedSources(this.kbId);
      if (!rows.length) return "All sources are cited in at least one wiki page.";
      return [`**${rows.length} uncited source(s):**\n`, ...rows.map((r) => `  ${r.path}${r.filename} (${r.file_type})`)].join("\n");
    }
    if (query === "stale") {
      const rows = await this.fs.findStalePages(this.kbId);
      if (!rows.length) return "No stale pages found.";
      return [`**${rows.length} potentially stale page(s):**\n`, ...rows.map((r) => `  ${r.path}${r.filename}`)].join("\n");
    }
    if (!path || path === "*" || path === "**") {
      return 'references mode requires a `path`, or query="uncited" / query="stale".';
    }
    const [dirPath, filename] = resolvePath(path);
    const doc = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (!doc) return `Document '${path}' not found.`;
    const forward = await this.fs.getForwardReferences(doc.id);
    const backlinks = await this.fs.getBacklinks(doc.id);
    const lines = [`**References for ${doc.title || doc.filename}** (\`${dirPath}${filename}\`):\n`];
    if (forward.length) {
      for (const r of forward) {
        const page = r.page ? `, p.${r.page as number}` : "";
        lines.push(`  → ${r.path}${r.filename}${page} (${r.reference_type as string})`);
      }
    } else lines.push("No outgoing references.");
    lines.push("");
    if (backlinks.length) {
      for (const r of backlinks) lines.push(`  ← ${r.path}${r.filename} (${r.reference_type as string})`);
    } else lines.push("No incoming references (backlinks).");
    return lines.join("\n");
  }

  // ── read ─────────────────────────────────────────────────────────
  async read(path: string, pages?: string): Promise<string> {
    if (path.includes("*") || path.includes("?")) return this.readGlob(path);
    const [dirPath, filename] = resolvePath(path);
    let doc = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (!doc) doc = await this.fs.findDocumentByName(this.kbId, filename);
    if (!doc) return `Document '${path}' not found.`;

    if (pages && pages.trim()) {
      const total = (doc.page_count as number) ?? 0;
      const wanted = parsePageRange(pages, Math.max(total, 1));
      if (wanted.length) {
        const rows = await this.fs.getPages(doc.id, wanted);
        const body = rows.map((r) => `### Page ${r.page as number}\n\n${r.content as string}`).join("\n\n");
        return `# ${doc.title || doc.filename}\n\n${body}`;
      }
    }
    const content = (doc.content as string) ?? "";
    return `# ${doc.title || doc.filename}\n\n${content}${await backlinksSummary(this.fs, doc.id)}`;
  }

  private async readGlob(pattern: string): Promise<string> {
    const pat = pattern.startsWith("/") ? pattern : `/${pattern.replace(/^\/+/, "")}`;
    const docs = (await this.fs.listDocuments(this.kbId)).filter((d) => globMatch(d.path + d.filename, pat));
    if (!docs.length) return `No documents match \`${pattern}\`.`;
    const parts: string[] = [];
    for (const d of docs) {
      const full = await this.fs.getDocument(this.kbId, d.filename, d.path);
      parts.push(`## ${d.path}${d.filename}\n\n${(full?.content as string) ?? "(no text content)"}`);
    }
    return parts.join("\n\n---\n\n");
  }

  // ── write ────────────────────────────────────────────────────────
  async create(path: string, title: string, content: string, tags: string[], dateStr: string, overwrite: boolean): Promise<string> {
    if (!title) return "Error: title is required when creating a note.";
    const dirPath = toDirPath(path);
    const [filename, fileType] = titleToFilename(title);
    title = humanizeTitle(title);
    content = ensureWikiFrontmatter(content, title, tags, dateStr, dirPath, filename, fileType);
    const effTags = effectiveTags(content, tags) ?? [];
    if (!effTags.length) return "Error: at least one tag is required when creating a note.";

    const existing = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (existing && !overwrite) {
      return `Error: \`${dirPath}${filename}\` already exists. Use \`edit\`, or pass overwrite=true.`;
    }
    const [, fmMeta] = extractDateAndMeta(parseFrontmatter(content));
    const savedDate = effectiveDate(content, dateStr);
    // SVG/CSV are wiki-layer assets (embedded in pages, hidden from listings); the rest are wiki pages.
    const kind = fileType === "svg" || fileType === "csv" ? "asset" : "wiki";

    let docId: string;
    if (existing) {
      await this.fs.updateDocument(existing.id, content, {
        tags: effTags,
        title,
        date: savedDate ?? undefined,
        metadata: fmMeta,
      });
      docId = existing.id;
    } else {
      try {
        const doc = await this.fs.createDocument(this.kbId, filename, title, dirPath, fileType, content, effTags, savedDate, fmMeta, undefined, kind);
        docId = doc.id;
      } catch (err) {
        if (err instanceof DuplicateDocumentError) {
          return `Error: \`${dirPath}${filename}\` already exists. Use \`edit\`, or pass overwrite=true.`;
        }
        throw err;
      }
    }
    await this.syncReferences(docId, content, dirPath, fileType);
    const link = deepLink(this.slug, dirPath, filename);
    const impact = await this.wikiImpact(docId, dirPath);
    return `Created **${title}** at \`${dirPath}${filename}\`\nTags: ${effTags.join(", ")}\n[View](${link})${impact}`;
  }

  async edit(path: string, oldText: string, newText: string): Promise<string> {
    if (!oldText) return "Error: old_text is required for str_replace.";
    const [dirPath, filename] = resolvePath(path);
    const doc = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (!doc) return `Document '${path}' not found.`;
    const content = (doc.content as string) ?? "";
    const count = content.split(oldText).length - 1;
    if (count === 0) return "Error: no match found for old_text.";
    if (count > 1) return `Error: found ${count} matches for old_text. Provide more context.`;

    const newContent = content.replace(oldText, newText);
    const [fmDate, fmMeta] = extractDateAndMeta(parseFrontmatter(newContent));
    await this.fs.updateDocument(doc.id, newContent, {
      tags: effectiveTags(newContent, null) ?? undefined,
      date: fmDate ?? undefined,
      metadata: fmMeta,
    });
    await this.syncReferences(doc.id, newContent, dirPath);
    const impact = await this.wikiImpact(doc.id, dirPath);
    return `Edited \`${path}\`. Replaced 1 occurrence.${impact}`;
  }

  async append(path: string, content: string): Promise<string> {
    const [dirPath, filename] = resolvePath(path);
    const doc = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (!doc) return `Document '${path}' not found.`;
    const newContent = appendMarkdownSection((doc.content as string) ?? "", content);
    const [fmDate, fmMeta] = extractDateAndMeta(parseFrontmatter(newContent));
    await this.fs.updateDocument(doc.id, newContent, {
      tags: effectiveTags(newContent, null) ?? undefined,
      date: fmDate ?? undefined,
      metadata: fmMeta,
    });
    await this.syncReferences(doc.id, newContent, dirPath);
    const impact = await this.wikiImpact(doc.id, dirPath);
    return `Appended to \`${path}\`.${impact}`;
  }

  async deleteDoc(path: string): Promise<string> {
    const [dirPath, filename] = resolvePath(path);
    if (dirPath === "/wiki/" && (filename === "overview.md" || filename === "log.md")) {
      return `Protected: \`${dirPath}${filename}\` cannot be deleted.`;
    }
    const doc = await this.fs.getDocument(this.kbId, filename, dirPath);
    if (!doc) return `Document '${path}' not found.`;
    await this.fs.archiveDocuments([doc.id]);
    return `Deleted \`${dirPath}${filename}\`.`;
  }

  // ── lint ─────────────────────────────────────────────────────────
  async lint(): Promise<string> {
    const errors: string[] = [];
    const warns: string[] = [];
    const docs = await this.fs.listDocumentsWithContent(this.kbId);
    const wiki = docs.filter((d) => d.path.startsWith("/wiki/"));
    const wikiPaths = new Set(wiki.map((d) => (d.path + d.filename).replace("/wiki/", "").toLowerCase()));

    for (const d of wiki) {
      const path = `${d.path}${d.filename}`;
      const isLog = d.path === "/wiki/" && d.filename === "log.md";
      if (d.file_type !== "md" || isLog) continue;
      const meta = parseFrontmatter((d.content as string) ?? "");
      for (const field of ["title", "description", "date", "tags"]) {
        if (!meta[field]) errors.push(`${path}: missing frontmatter \`${field}\``);
      }
      const wikiDir = d.path.replace("/wiki/", "");
      for (const link of parseWikiLinks((d.content as string) ?? "", wikiDir)) {
        const l = link.toLowerCase();
        const ok = wikiPaths.has(l) || wikiPaths.has(`${l}.md`) || wikiPaths.has(l.split("/").at(-1)!);
        if (!ok) warns.push(`${path}: dangling wiki link → ${link}`);
      }
    }

    const refs = await this.fs.listReferences(this.kbId);
    const targets = new Set(refs.map((r) => r.target_document_id as string));
    for (const d of wiki) {
      if (d.path === "/wiki/" && (d.filename === "overview.md" || d.filename === "log.md")) continue;
      if (!targets.has(d.id)) warns.push(`${d.path}${d.filename}: orphan page (no incoming references)`);
    }
    for (const r of await this.fs.findUncitedSources(this.kbId)) warns.push(`${r.path}${r.filename}: uncited source`);
    for (const r of await this.fs.findStalePages(this.kbId)) warns.push(`${r.path}${r.filename}: stale page`);

    if (!errors.length && !warns.length) return "Lint clean — no issues found.";
    const out: string[] = [];
    if (errors.length) out.push(`**${errors.length} error(s):**`, ...errors.map((e) => `  - ${e}`));
    if (warns.length) out.push(`**${warns.length} warning(s):**`, ...warns.map((w) => `  - ${w}`));
    return out.join("\n");
  }

  private async syncReferences(docId: string, content: string, dirPath: string, fileType = "md"): Promise<void> {
    if (dirPath.startsWith("/wiki/") && fileType === "md") {
      await updateReferences(this.fs, this.kbId, docId, content, dirPath);
      await this.fs.propagateStaleness(docId);
    }
  }

  private async wikiImpact(docId: string, dirPath: string): Promise<string> {
    if (!dirPath.startsWith("/wiki/")) return "";
    const rows = await this.fs.getBacklinks(docId);
    if (!rows.length) return "";
    const lines = [`\n**${rows.length} page(s) reference this document** — consider updating:`];
    for (const r of rows) lines.push(`  - \`${r.path}${r.filename}\` (${r.reference_type as string})`);
    return lines.join("\n");
  }
}

export type { DocumentRow };
export { TEXT };
