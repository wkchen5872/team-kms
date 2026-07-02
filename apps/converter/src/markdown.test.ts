import { describe, it, expect } from "vitest";
import { elementToMarkdown, assemblePages } from "./markdown.js";

// A 1x1 transparent PNG (base64 payload only).
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("elementToMarkdown", () => {
  it("renders headings with clamped level", () => {
    expect(elementToMarkdown({ type: "heading", "heading level": 2, content: "Title" })).toBe("## Title");
    expect(elementToMarkdown({ type: "heading", "heading level": 9, content: "Deep" })).toBe("###### Deep");
  });

  it("renders paragraphs verbatim", () => {
    expect(elementToMarkdown({ type: "paragraph", content: "Hello." })).toBe("Hello.");
  });

  it("renders nested lists", () => {
    const el = { type: "list", "list items": [{ content: "a", kids: [{ content: "a1" }] }, { content: "b" }] };
    expect(elementToMarkdown(el)).toBe("- a\n  - a1\n- b");
  });

  it("renders external (non-data-URI) images and captions", () => {
    expect(elementToMarkdown({ type: "image", source: "img.png" })).toBe("![image](img.png)");
    expect(elementToMarkdown({ type: "caption", content: "Fig 1" })).toBe("*Fig 1*");
    expect(elementToMarkdown({ type: "image" })).toBe("");
  });

  it("renders a table (rows → cells → paragraphs) as a GFM table", () => {
    const el = {
      type: "table",
      rows: [
        { type: "table row", cells: [
          { type: "table cell", kids: [{ type: "paragraph", content: "編號" }] },
          { type: "table cell", kids: [{ type: "paragraph", content: "案場" }] },
        ] },
        { type: "table row", cells: [
          { type: "table cell", kids: [{ type: "paragraph", content: "1" }] },
          { type: "table cell", kids: [{ type: "paragraph", content: "陞寶" }] },
        ] },
      ],
    };
    expect(elementToMarkdown(el)).toBe("| 編號 | 案場 |\n| --- | --- |\n| 1 | 陞寶 |");
  });

  it("returns empty string for unknown types", () => {
    expect(elementToMarkdown({ type: "weird", content: "x" })).toBe("");
  });
});

describe("assemblePages", () => {
  it("groups elements by page and excludes header/footer", () => {
    const data = {
      "number of pages": 2,
      kids: [
        { type: "heading", "heading level": 1, content: "P1", "page number": 1 },
        { type: "footer", content: "skip me", "page number": 1 },
        { type: "paragraph", content: "Body two", "page number": 2 },
        { type: "header", content: "skip", "page number": 2 },
      ],
    };
    const { pages, warnings } = assemblePages(data);
    expect(pages).toEqual([
      { page: 1, content: "# P1", images: [] },
      { page: 2, content: "Body two", images: [] },
    ]);
    expect(warnings).toEqual([]);
  });

  it("yields empty content for pages with no usable elements", () => {
    const { pages } = assemblePages({ "number of pages": 1, kids: [] });
    expect(pages).toEqual([{ page: 1, content: "", images: [] }]);
  });

  // opendataloader (imageOutput=embedded) emits `data` (data URI) + `format`.
  const imgEl = (page = 1) => ({ type: "image", "page number": page, data: `data:image/png;base64,${PNG_1x1}`, format: "png" });

  it("extracts embedded (data-URI) images into the images list with a token in content", () => {
    const data = {
      "number of pages": 1,
      kids: [{ type: "paragraph", content: "Intro", "page number": 1 }, imgEl(1)],
    };
    const { pages } = assemblePages(data);
    expect(pages[0]!.images).toEqual([{ id: "img-p1-1.png", dataBase64: PNG_1x1, format: "png" }]);
    expect(pages[0]!.content).toBe("Intro\n\n![image](odl-image:img-p1-1.png)");
  });

  it("leaves external image references untouched (no bytes extracted)", () => {
    const data = { "number of pages": 1, kids: [{ type: "image", source: "figure.png", "page number": 1 }] };
    const { pages } = assemblePages(data);
    expect(pages[0]!.images).toEqual([]);
    expect(pages[0]!.content).toBe("![image](figure.png)");
  });

  it("caps images per page and reports a warning", () => {
    const data = { "number of pages": 1, kids: [imgEl(1), imgEl(1)] };
    const { pages, warnings } = assemblePages(data, { maxImagesPerPage: 1 });
    expect(pages[0]!.images.length).toBe(1);
    expect(warnings.some((w) => w.includes("page 1"))).toBe(true);
  });

  it("skips oversized images and reports a warning", () => {
    const data = { "number of pages": 1, kids: [imgEl(1)] };
    const { pages, warnings } = assemblePages(data, { maxImageBytes: 1 });
    expect(pages[0]!.images).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
