/**
 * Reference parsing and graph building.
 *
 * Parses wiki page content for footnote citations (`[^N]: filename.pdf, p.3`)
 * and internal links (`[text](path.md)`), producing reference edges.
 * Ported from llmwiki `api/services/references.py` (the pure, testable form).
 */

export interface RefDoc {
  id: string;
  filename: string;
  path: string;
  title?: string | null;
}

export type RefType = "cites" | "links_to";

export interface RefEdge {
  targetId: string;
  type: RefType;
  page: number | null;
}

export interface LookupMaps {
  filenameToDoc: Map<string, RefDoc>;
  baseToDoc: Map<string, RefDoc>;
  wikiPathToDoc: Map<string, RefDoc>;
}

// `matchAll` clones the regex internally, so a shared `g` regex is safe.
const CITATION_RE = /\[\^\d+\]:\s*(.+)$/gm;
const WIKI_LINK_RE = /(?<!!)\[(?:[^\]]*)\]\(([^)]+)\)/g;
const EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|csv|html?|md|txt)$/;
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

// Extension-anchored citation token: a filename ending in a known extension,
// with an optional trailing `, p.N`. Filenames commonly contain " - " as a
// structural separator (e.g. "2025 - 台糖 - 陳平段.md"), so we anchor on the
// extension instead of splitting on " - " (which truncated such names). Multiple
// tokens in one footnote (e.g. "A.doc；B.doc") each become a separate citation.
const CITATION_TOKEN_RE = /(.+?\.(?:pdf|docx?|pptx?|xlsx?|csv|html?|md|txt))(?:\s*,\s*p\.?\s*(\d+))?/gi;

function stripExt(name: string): string {
  return name.replace(EXT_RE, "");
}

/**
 * Parse a footnote citation value into one or more (filename, page) pairs.
 * Anchors on file extensions so " - " inside a filename is preserved and
 * compound footnotes ("A.pdf；B.pdf") yield multiple citations. Falls back to
 * the whole trimmed string when no known extension is present.
 */
export function parseCitations(raw: string): [string, number | null][] {
  let s = raw.trim().replace(/^\*+/, "").replace(/\*+$/, "");
  const linkMatch = /^\[([^\]]+)\]\([^)]*\)(.*)$/.exec(s);
  if (linkMatch) {
    s = `${linkMatch[1]}${linkMatch[2]}`;
  }
  const out: [string, number | null][] = [];
  for (const m of s.matchAll(CITATION_TOKEN_RE)) {
    // matchAll can carry a leading separator from the previous token into the
    // greedy-min prefix (e.g. "；B.doc"); strip it off.
    const filename = m[1]!.replace(/^[\s；;、,]+/, "").trim();
    if (filename) out.push([filename, m[2] ? parseInt(m[2], 10) : null]);
  }
  return out.length ? out : [[s.trim(), null]];
}

/** Extract the first filename + optional page from a citation. */
export function parseCitationFilename(raw: string): [string, number | null] {
  return parseCitations(raw)[0]!;
}

/** Extract internal wiki link paths, resolved relative to currentDir. */
export function parseWikiLinks(content: string, currentDir: string): string[] {
  const paths: string[] = [];
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    const href = match[1]!;
    if (/^(http|#|mailto:|data:)/.test(href)) continue;
    if (IMAGE_EXT_RE.test(href)) continue;

    let resolved: string;
    if (href.startsWith("/wiki/")) {
      resolved = href.replace("/wiki/", "");
    } else if (href.startsWith("./")) {
      resolved = currentDir ? currentDir + href.slice(2) : href.slice(2);
    } else if (href.startsWith("../")) {
      const parts = `${currentDir.replace(/\/+$/, "")}/${href}`.split("/");
      const resolvedParts: string[] = [];
      for (const p of parts) {
        if (p === "..") {
          if (resolvedParts.length) resolvedParts.pop();
        } else if (p && p !== ".") {
          resolvedParts.push(p);
        }
      }
      resolved = resolvedParts.join("/");
    } else if (!href.includes("/")) {
      resolved = currentDir ? currentDir + href : href;
    } else {
      resolved = href;
    }

    if (resolved) paths.push(resolved);
  }
  return paths;
}

/** Build filename, base-name, and wiki-path lookup maps from a doc list. */
export function buildLookupMaps(allDocs: RefDoc[]): LookupMaps {
  const filenameToDoc = new Map<string, RefDoc>();
  const baseToDoc = new Map<string, RefDoc>();
  const wikiPathToDoc = new Map<string, RefDoc>();

  for (const doc of allDocs) {
    const fnLower = doc.filename.toLowerCase();
    if (!filenameToDoc.has(fnLower)) filenameToDoc.set(fnLower, doc);
    if (doc.title) {
      const titleLower = doc.title.toLowerCase();
      if (!filenameToDoc.has(titleLower)) filenameToDoc.set(titleLower, doc);
    }
    const base = stripExt(fnLower);
    if (!baseToDoc.has(base)) baseToDoc.set(base, doc);
    if (doc.path.startsWith("/wiki/")) {
      const relative = (doc.path + doc.filename).replace("/wiki/", "");
      wikiPathToDoc.set(relative.toLowerCase(), doc);
    }
  }

  return { filenameToDoc, baseToDoc, wikiPathToDoc };
}

/** Parse content and return reference edges. */
export function extractReferences(
  content: string,
  docId: string,
  wikiDir: string,
  filenameToDoc: Map<string, RefDoc>,
  baseToDoc: Map<string, RefDoc>,
  wikiPathToDoc: Map<string, RefDoc>,
): RefEdge[] {
  const edges: RefEdge[] = [];
  const seen = new Set<string>();

  const add = (target: RefDoc | undefined, type: RefType, page: number | null): void => {
    if (!target || target.id === docId) return;
    const key = `${target.id}|${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ targetId: target.id, type, page });
  };

  // Footnote citations: [^N]: filename.pdf, p.3 — one footnote may cite several
  // sources (compound), so parse each into its own edge.
  for (const match of content.matchAll(CITATION_RE)) {
    for (const [filename, page] of parseCitations(match[1]!)) {
      const fnLower = filename.toLowerCase();
      let target = filenameToDoc.get(fnLower);
      if (!target) target = baseToDoc.get(stripExt(fnLower));
      add(target, "cites", page);
    }
  }

  // Wiki cross-references: [text](path.md)
  for (const linkPath of parseWikiLinks(content, wikiDir)) {
    const lower = linkPath.toLowerCase();
    let target = wikiPathToDoc.get(lower) ?? wikiPathToDoc.get(`${lower}.md`);
    if (!target) target = wikiPathToDoc.get(linkPath.split("/").at(-1)!.toLowerCase());
    add(target, "links_to", null);
  }

  return edges;
}
