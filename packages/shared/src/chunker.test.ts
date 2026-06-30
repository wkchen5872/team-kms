import { describe, it, expect } from "vitest";
import { chunkText, chunkPages, estimateTokens, MAX_CHUNK_CHARS } from "./chunker.js";

describe("chunkText", () => {
  it("empty content returns nothing", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText(null)).toEqual([]);
  });

  it("short text returns one chunk", () => {
    const text = "This is a paragraph with enough words to comfortably exceed the minimum token threshold. ".repeat(3).trim();
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.page).toBeNull();
  });

  it("very short text below minimum is dropped", () => {
    expect(chunkText("hi")).toEqual([]);
  });

  it("long text produces multiple chunks", () => {
    const para = "Word ".repeat(300);
    const text = `${para}\n\n${para}\n\n${para}`;
    expect(chunkText(text).length).toBeGreaterThan(1);
  });

  it("chunks have sequential indices", () => {
    const text = ("Paragraph of text. ".repeat(50) + "\n\n").repeat(10);
    const chunks = chunkText(text);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("tracks header breadcrumb", () => {
    const text = "# Main Title\n\nIntro paragraph.\n\n## Section A\n\n" + "Content. ".repeat(50);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const last = chunks.at(-1)!;
    expect(last.headerBreadcrumb).toContain("Main Title");
    expect(last.headerBreadcrumb).toContain("Section A");
  });

  it("page parameter propagates", () => {
    const chunks = chunkText("Enough content to make a chunk. ".repeat(10), { page: 5 });
    expect(chunks.every((c) => c.page === 5)).toBe(true);
  });

  it("respects start char offset", () => {
    const chunks = chunkText("Enough content to make a chunk. ".repeat(10), { startCharOffset: 100 });
    expect(chunks[0]!.startChar).toBeGreaterThanOrEqual(100);
  });

  it("token count is positive", () => {
    const chunks = chunkText("A reasonable paragraph with sufficient words. ".repeat(10));
    expect(chunks.every((c) => c.tokenCount > 0)).toBe(true);
  });
});

describe("chunkPages", () => {
  it("preserves page numbers", () => {
    const chunks = chunkPages([
      [1, "First page content. ".repeat(20)],
      [2, "Second page content. ".repeat(20)],
    ]);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const pages = new Set(chunks.map((c) => c.page));
    expect(pages.has(1)).toBe(true);
    expect(pages.has(2)).toBe(true);
  });

  it("assigns global indices", () => {
    const chunks = chunkPages([
      [1, "Content A. ".repeat(20)],
      [2, "Content B. ".repeat(20)],
    ]);
    expect(chunks.map((c) => c.index)).toEqual([...chunks.keys()]);
  });
});

describe("estimateTokens", () => {
  it("rough estimate", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("")).toBe(1);
  });
});

describe("enforceMaxChars per-piece start_char", () => {
  it("splits oversized chunk with increasing offsets", () => {
    const sentence = "All this happened, more or less. ".repeat(6);
    const paragraph = sentence.repeat(200).trim();
    expect(paragraph.length).toBeGreaterThan(MAX_CHUNK_CHARS);

    const chunks = chunkText(paragraph, { page: 7, startCharOffset: 1000 });
    expect(chunks.filter((c) => c.content.length > MAX_CHUNK_CHARS)).toEqual([]);

    const starts = chunks.map((c) => c.startChar);
    expect(starts[0]).toBe(1000);
    expect(new Set(starts).size).toBe(starts.length);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
  });

  it("leaves under-limit chunks unchanged", () => {
    const text = "This is a properly sized paragraph with enough words to actually be chunked. ".repeat(4).trim();
    const chunks = chunkText(text, { page: 1, startCharOffset: 500 });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of chunks) expect(c.startChar).not.toBeNull();
  });
});
