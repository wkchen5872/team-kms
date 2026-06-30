import { describe, it, expect } from "vitest";
import { elementToMarkdown, assemblePages } from "./markdown.js";

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

  it("renders images and captions", () => {
    expect(elementToMarkdown({ type: "image", source: "img.png" })).toBe("![image](img.png)");
    expect(elementToMarkdown({ type: "caption", content: "Fig 1" })).toBe("*Fig 1*");
    expect(elementToMarkdown({ type: "image" })).toBe("");
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
    expect(assemblePages(data)).toEqual([
      { page: 1, content: "# P1" },
      { page: 2, content: "Body two" },
    ]);
  });

  it("yields empty content for pages with no usable elements", () => {
    const data = { "number of pages": 1, kids: [] };
    expect(assemblePages(data)).toEqual([{ page: 1, content: "" }]);
  });
});
