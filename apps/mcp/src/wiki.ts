/**
 * Pure wiki helpers ported from llmwiki `mcp/tools/{helpers,write}.py`:
 * path/glob utilities, YAML frontmatter handling, and footnote-aware append.
 */
import yaml from "js-yaml";

export const MAX_LIST = 50;
export const MAX_SEARCH = 20;

const FILE_EXT_RE = /\.(md|txt|svg|csv|json|xml|html)$/i;
const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]+?\n)---[ \t]*\n/;
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:/;
const ASSET_EXTENSIONS = [".svg", ".csv", ".json", ".xml", ".html"];

export function deepLink(slug: string, path: string, filename: string): string {
  const appUrl = process.env.APP_URL ?? "";
  const full = `${path.replace(/\/+$/, "")}/${filename}`.replace(/^\/+/, "");
  return `${appUrl}/wikis/${slug}/${full}`;
}

/** fnmatch-style glob: `*`/`?` match any chars (including `/`), like Python fnmatch. */
export function globMatch(filepath: string, pattern: string): boolean {
  const re = new RegExp(
    "^" +
      pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
      "$",
  );
  return re.test(filepath);
}

export function resolvePath(path: string): [string, string] {
  const clean = path.replace(/^\/+/, "");
  if (clean.includes("/")) {
    const i = clean.lastIndexOf("/");
    return [`/${clean.slice(0, i)}/`, clean.slice(i + 1)];
  }
  return ["/", clean];
}

export function parsePageRange(pagesStr: string, maxPage: number): number[] {
  const result = new Set<number>();
  for (const raw of pagesStr.split(",")) {
    const part = raw.trim();
    if (part.includes("-")) {
      const [s, e] = part.split("-", 2).map((x) => x.trim());
      if (!/^\d+$/.test(s ?? "") || !/^\d+$/.test(e ?? "")) continue;
      for (let p = Math.max(1, Number(s)); p <= Math.min(maxPage, Number(e)); p++) result.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = Number(part);
      if (p >= 1 && p <= maxPage) result.add(p);
    }
  }
  return [...result].sort((a, b) => a - b);
}

export function parseFrontmatter(content: string): Record<string, unknown> {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return {};
  try {
    const meta = yaml.load(m[1]!);
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function extractFrontmatterTags(meta: Record<string, unknown>): string[] | null {
  if (!("tags" in meta)) return null;
  const raw = meta.tags;
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

export function extractDateAndMeta(meta: Record<string, unknown>): [string | null, Record<string, unknown>] {
  let dateStr: string | null = null;
  if ("date" in meta && meta.date != null) {
    // YAML auto-parses an unquoted ISO date (2026-06-30) into a Date object; String()
    // would yield a long localized form, so normalize a Date back to YYYY-MM-DD.
    dateStr = meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : String(meta.date);
  }
  const metadata: Record<string, unknown> = {};
  if (typeof meta.description === "string" && meta.description.trim()) metadata.description = meta.description.trim();
  return [dateStr, metadata];
}

export function effectiveTags(content: string, provided: string[] | null): string[] | null {
  const fm = extractFrontmatterTags(parseFrontmatter(content));
  return fm !== null ? fm : provided;
}

export function effectiveDate(content: string, provided?: string | null): string | null {
  const [fmDate] = extractDateAndMeta(parseFrontmatter(content));
  return fmDate || provided || null;
}

function defaultDescription(content: string, title: string): string {
  for (const rawLine of content.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("[^")) continue;
    line = line.replace(/^#+\s*/, "").trim();
    if (line) return line.slice(0, 180);
  }
  return `Notes about ${title}.`;
}

export function ensureWikiFrontmatter(
  content: string,
  title: string,
  tags: string[],
  dateStr: string,
  dirPath: string,
  filename: string,
  fileType: string,
): string {
  if (fileType !== "md" || !dirPath.startsWith("/wiki/")) return content;
  if (dirPath === "/wiki/" && filename === "log.md") return content;
  if (FRONTMATTER_RE.test(content)) return content;

  const today = new Date().toISOString().slice(0, 10);
  const metadata = {
    title,
    description: defaultDescription(content, title),
    date: dateStr.trim() || today,
    tags: tags.map((t) => String(t).trim()).filter(Boolean),
  };
  const frontmatter = yaml.dump(metadata, { sortKeys: false, lineWidth: -1 }).trim();
  return `---\n${frontmatter}\n---\n\n${content.replace(/^\n+/, "")}`;
}

// ── Append with trailing-footnote awareness ──────────────────────
function isFootnoteSuffixLine(line: string): boolean {
  return line.trim() === "" || line.startsWith(" ") || line.startsWith("\t") || FOOTNOTE_DEF_RE.test(line);
}

function splitTrailingFootnotes(content: string): [string, string] {
  const stripped = content.replace(/\s+$/, "");
  if (!stripped) return ["", ""];
  const lines = stripped.split("\n");
  for (let idx = 0; idx < lines.length; idx++) {
    if (FOOTNOTE_DEF_RE.test(lines[idx]!) && lines.slice(idx).every(isFootnoteSuffixLine)) {
      return [lines.slice(0, idx).join("\n").replace(/\s+$/, ""), lines.slice(idx).join("\n").replace(/\s+$/, "")];
    }
  }
  return [stripped, ""];
}

function footnoteIds(text: string): string[] {
  const ids: string[] = [];
  for (const line of text.split("\n")) {
    const m = FOOTNOTE_DEF_RE.exec(line);
    if (m) ids.push(m[1]!);
  }
  return ids;
}

function renumberCollidingFootnotes(existing: string, addition: string): string {
  const existingIds = new Set(footnoteIds(existing));
  const incomingIds = footnoteIds(addition);
  if (existingIds.size === 0 || incomingIds.length === 0) return addition;

  const numeric = [...new Set([...existingIds, ...incomingIds])].filter((i) => /^\d+$/.test(i)).map(Number);
  let nextId = (numeric.length ? Math.max(...numeric) : 0) + 1;
  const used = new Set(existingIds);
  const replacements = new Map<string, string>();

  for (const id of incomingIds) {
    if (!used.has(id)) {
      used.add(id);
      continue;
    }
    while (used.has(String(nextId))) nextId++;
    replacements.set(id, String(nextId));
    used.add(String(nextId));
    nextId++;
  }
  let out = addition;
  for (const [oldId, newId] of replacements) {
    out = out.replace(new RegExp(`\\[\\^${oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`, "g"), `[^${newId}]`);
  }
  return out;
}

export function appendMarkdownSection(existing: string, addition: string): string {
  const renumbered = renumberCollidingFootnotes(existing, addition.replace(/^\n+|\n+$/g, ""));
  const [body, footnotes] = splitTrailingFootnotes(existing);
  return [body, renumbered, footnotes].filter(Boolean).join("\n\n");
}

// ── title → filename ─────────────────────────────────────────────
function slugifyFilename(name: string): string {
  return name.replace(/ /g, "-").replace(/[^\w\s\-.]/g, "");
}

export function titleToFilename(title: string): [string, string] {
  const lower = title.toLowerCase();
  for (const ext of ASSET_EXTENSIONS) {
    if (lower.endsWith(ext)) return [slugifyFilename(lower), ext.slice(1)];
  }
  const slug = lower.replace(/\.(md|txt)$/, "");
  let filename = slugifyFilename(slug);
  if (!filename.endsWith(".md")) filename += ".md";
  return [filename, "md"];
}

export function humanizeTitle(title: string): string {
  const clean = title.replace(/\.(md|txt|svg|csv|json|xml|html)$/, "");
  if (clean === clean.toLowerCase() && clean.includes("-")) {
    return clean
      .replace(/[-_]/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return clean;
}

export function toDirPath(path: string): string {
  if (FILE_EXT_RE.test(path)) {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i + 1) : "/";
  }
  let dir = path.endsWith("/") ? path : `${path}/`;
  if (!dir.startsWith("/")) dir = `/${dir}`;
  return dir;
}
