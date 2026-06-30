import { describe, it, expect } from "vitest";
import { parseCitationFilename, extractReferences, type RefDoc } from "./references.js";

describe("parseCitationFilename", () => {
  it("preserves a hyphenated version suffix", () => {
    expect(parseCitationFilename("2501.12948v2-2.pdf, p.5")).toEqual(["2501.12948v2-2.pdf", 5]);
  });

  it("keeps page suffix when wrapped in a markdown link", () => {
    expect(parseCitationFilename("[paper.pdf](https://example.com/paper), p.7")).toEqual(["paper.pdf", 7]);
  });
});

const doc = (id: string, path: string, filename: string): RefDoc => ({ id, path, filename, title: filename });

function wikiPathMap(docs: RefDoc[]): Map<string, RefDoc> {
  const out = new Map<string, RefDoc>();
  for (const d of docs) {
    if (d.path.startsWith("/wiki/")) out.set((d.path + d.filename).replace("/wiki/", "").toLowerCase(), d);
  }
  return out;
}

describe("extractReferences — citations", () => {
  it("matches a hyphenated version source", () => {
    const source: RefDoc = { id: "source-1", filename: "2501.12948v2-2.pdf", path: "/", title: "DeepSeek-R1" };
    const page: RefDoc = { id: "page-1", filename: "deepseek-r1.md", path: "/wiki/", title: "DeepSeek-R1" };
    const edges = extractReferences(
      "DeepSeek-R1 uses reinforcement learning.[^1]\n\n[^1]: 2501.12948v2-2.pdf, p.5",
      "page-1",
      "",
      new Map([["2501.12948v2-2.pdf", source], ["deepseek-r1.md", page]]),
      new Map([["2501.12948v2-2", source], ["deepseek-r1", page]]),
      new Map([["deepseek-r1.md", page]]),
    );
    expect(edges).toEqual([{ targetId: "source-1", type: "cites", page: 5 }]);
  });
});

const ABS = doc("abs-1", "/wiki/", "abs.md");
const SIBLING = doc("sib-1", "/wiki/notes/", "sibling.md");
const PARENT = doc("par-1", "/wiki/", "parent.md");
const BARE = doc("bare-1", "/wiki/notes/", "name.md");

describe("extractReferences — wiki links", () => {
  const empty = new Map<string, RefDoc>();

  it("resolves links against the wiki path map", () => {
    const map = wikiPathMap([ABS, SIBLING, PARENT, BARE]);
    const cases: [string, string, string][] = [
      ["absolute /wiki/ link", "[a](/wiki/abs.md)", "abs-1"],
      ["./sibling relative", "[s](./sibling.md)", "sib-1"],
      ["../parent stack collapse", "[p](../parent.md)", "par-1"],
      ["bare name in current dir", "[n](name.md)", "bare-1"],
    ];
    for (const [label, content, target] of cases) {
      expect(extractReferences(content, "writer-1", "notes/", empty, empty, map), label).toEqual([
        { targetId: target, type: "links_to", page: null },
      ]);
    }
  });

  it("dedups duplicate link targets to one edge", () => {
    const map = wikiPathMap([ABS]);
    const edges = extractReferences(
      "See [first](/wiki/abs.md) and again [second](/wiki/abs.md).",
      "writer-1",
      "notes/",
      empty,
      empty,
      map,
    );
    expect(edges).toEqual([{ targetId: "abs-1", type: "links_to", page: null }]);
  });

  it("excludes self-references", () => {
    const map = wikiPathMap([ABS]);
    expect(extractReferences("[me](/wiki/abs.md)", "abs-1", "", empty, empty, map)).toEqual([]);
  });

  it("skips non-wiki and image links by href shape", () => {
    const img = doc("img-1", "/wiki/", "diagram.png");
    const map = wikiPathMap([ABS, img]);
    const skipped = [
      "[http](https://example.com/abs.md)",
      "[hash](#abs.md)",
      "[mail](mailto:abs.md)",
      "[data](data:text/plain,abs.md)",
      "[png](/wiki/diagram.png)",
      "[jpg](/wiki/abs.jpg)",
      "[svg](/wiki/abs.svg)",
    ];
    for (const content of skipped) {
      expect(extractReferences(content, "writer-1", "notes/", empty, empty, map), content).toEqual([]);
    }
  });
});
