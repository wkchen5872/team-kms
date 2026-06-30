/**
 * Text chunker with header breadcrumb tracking.
 *
 * Splits document content into ~512 token chunks with ~128 token overlap,
 * tracking markdown headers to build a breadcrumb per chunk.
 *
 * Ported from llmwiki `api/services/chunker.py`. Persistence (`store_chunks`)
 * lives in the VaultFS layer here, since the reduced schema dropped the
 * `source_content` column (migration 007 not adopted).
 */

export const CHUNK_SIZE = 512;
export const CHUNK_OVERLAP = 128;
export const MIN_CHUNK_TOKENS = 32;
export const MAX_CHUNK_CHARS = 10_000; // matches DB CHECK on document_chunks.content

const SENTENCE_RE = /(?<=[.!?。！？])\s+/;
// Anchored at start, first line only (no `m` flag → `.` stops at newline),
// matching Python's HEADER_RE.match(para) semantics.
const HEADER_RE = /^(#{1,6})\s+(.+)/;

export interface Chunk {
  index: number;
  content: string;
  page: number | null;
  startChar: number;
  tokenCount: number;
  headerBreadcrumb: string;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

export function chunkText(
  content: string | null | undefined,
  opts: { chunkSize?: number; overlap?: number; page?: number | null; startCharOffset?: number } = {},
): Chunk[] {
  const chunkSize = opts.chunkSize ?? CHUNK_SIZE;
  const overlap = opts.overlap ?? CHUNK_OVERLAP;
  const page = opts.page ?? null;
  const startCharOffset = opts.startCharOffset ?? 0;

  if (!content || !content.trim()) return [];

  const paragraphs = splitParagraphs(content);
  let headerStack: [number, string][] = [];
  const chunks: Chunk[] = [];
  let currentBlocks: string[] = [];
  let currentTokens = 0;
  let currentStart = startCharOffset;
  let charPos = startCharOffset;

  const pushChunk = (text: string, start: number): void => {
    if (estimateTokens(text) < MIN_CHUNK_TOKENS) return;
    chunks.push({
      index: chunks.length,
      content: text,
      page,
      startChar: start,
      tokenCount: estimateTokens(text),
      headerBreadcrumb: headerStack.map(([, t]) => t).join(" > "),
    });
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    const headerMatch = HEADER_RE.exec(para);
    if (headerMatch) {
      const level = headerMatch[1]!.length;
      const heading = headerMatch[2]!.trim();
      headerStack = headerStack.filter(([l]) => l < level);
      headerStack.push([level, heading]);
    }

    if (currentTokens + paraTokens > chunkSize && currentBlocks.length > 0) {
      pushChunk(currentBlocks.join("\n\n"), currentStart);

      const [overlapBlocks, overlapTokens] = getOverlap(currentBlocks, overlap);
      currentBlocks = overlapBlocks;
      currentTokens = overlapTokens;
      currentStart = charPos - overlapBlocks.reduce((s, b) => s + b.length + 2, 0);
    }

    currentBlocks.push(para);
    currentTokens += paraTokens;
    charPos += para.length + 2;
  }

  if (currentBlocks.length > 0) {
    pushChunk(currentBlocks.join("\n\n"), currentStart);
  }

  return enforceMaxChars(chunks);
}

export function chunkPages(pageContents: [number, string][]): Chunk[] {
  const all: Chunk[] = [];
  for (const [pageNum, content] of pageContents) {
    for (const c of chunkText(content, { page: pageNum })) {
      c.index = all.length;
      all.push(c);
    }
  }
  return all;
}

function enforceMaxChars(chunks: Chunk[]): Chunk[] {
  if (!chunks.some((c) => c.content.length > MAX_CHUNK_CHARS)) return chunks;

  const result: Chunk[] = [];
  for (const c of chunks) {
    if (c.content.length <= MAX_CHUNK_CHARS) {
      result.push({ ...c, index: result.length });
      continue;
    }
    // Each split piece gets its own start_char so downstream consumers can
    // derive each piece's end as startChar + content.length.
    const base = c.startChar || 0;
    let offset = 0;
    for (const piece of splitOversized(c.content)) {
      result.push({
        index: result.length,
        content: piece,
        page: c.page,
        startChar: base + offset,
        tokenCount: estimateTokens(piece),
        headerBreadcrumb: c.headerBreadcrumb,
      });
      offset += piece.length;
    }
  }
  return result;
}

function splitOversized(text: string): string[] {
  const parts = text.split(SENTENCE_RE);
  const pieces: string[] = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current} ${part}`.trim() : part;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
    } else {
      if (current) pieces.push(current);
      if (part.length <= MAX_CHUNK_CHARS) {
        current = part;
      } else {
        for (let i = 0; i < part.length; i += MAX_CHUNK_CHARS) {
          pieces.push(part.slice(i, i + MAX_CHUNK_CHARS));
        }
        current = "";
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function getOverlap(blocks: string[], targetTokens: number): [string[], number] {
  const result: string[] = [];
  let tokens = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const blockTokens = estimateTokens(blocks[i]!);
    if (tokens + blockTokens > targetTokens) break;
    result.unshift(blocks[i]!);
    tokens += blockTokens;
  }
  return [result, tokens];
}
