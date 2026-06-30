import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { extractPages } from "./extract.js";
import { makePdf } from "./test-pdf.js";

// Live: drives the real opendataloader Java CLI (requires a JVM on PATH).
describe("extractPages (live opendataloader)", () => {
  it("extracts per-page markdown from a real PDF", async () => {
    const dir = await mkdtemp(join(tmpdir(), "extract-test-"));
    const pdf = join(dir, "sample.pdf");
    await writeFile(pdf, makePdf("Hello Zoltaxian Trade Protocol"));
    try {
      const pages = await extractPages(pdf);
      expect(pages.length).toBe(1);
      expect(pages[0]!.page).toBe(1);
      expect(pages[0]!.content).toContain("Zoltaxian");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
