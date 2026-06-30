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

function stripExt(name: string): string {
  return name.replace(EXT_RE, "");
}

/** Extract filename and optional page from a citation like 'paper.pdf, p.3'. */
export function parseCitationFilename(raw: string): [string, number | null] {
  let s = raw.trim().replace(/^\*+/, "").replace(/\*+$/, "");
  const linkMatch = /^\[([^\]]+)\]\([^)]*\)(.*)$/.exec(s);
  if (linkMatch) {
    s = `${linkMatch[1]}${linkMatch[2]}`;
  }
  s = s.split(/\s+[-–—]\s+/)[0]!.trim();
  const pageMatch = /,\s*p\.?\s*(\d+)\b/.exec(s);
  if (pageMatch) {
    return [s.slice(0, pageMatch.index).trim(), parseInt(pageMatch[1]!, 10)];
  }
  return [s, null];
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

  // Footnote citations: [^N]: filename.pdf, p.3
  for (const match of content.matchAll(CITATION_RE)) {
    const [filename, page] = parseCitationFilename(match[1]!);
    const fnLower = filename.toLowerCase();
    let target = filenameToDoc.get(fnLower);
    if (!target) target = baseToDoc.get(stripExt(fnLower));
    add(target, "cites", page);
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
