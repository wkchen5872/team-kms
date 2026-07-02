import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { extractPages } from "./extract.js";
import { makePdf, makeImagePdf } from "./test-pdf.js";

// Live: drives the real opendataloader Java CLI (requires a JVM on PATH).
describe("extractPages (live opendataloader)", () => {
  it("extracts per-page markdown from a real PDF", async () => {
    const dir = await mkdtemp(join(tmpdir(), "extract-test-"));
    const pdf = join(dir, "sample.pdf");
    await writeFile(pdf, makePdf("Hello Zoltaxian Trade Protocol"));
    try {
      const { pages } = await extractPages(pdf);
      expect(pages.length).toBe(1);
      expect(pages[0]!.page).toBe(1);
      expect(pages[0]!.content).toContain("Zoltaxian");
      expect(pages[0]!.images).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("extracts an embedded image from a real PDF as bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "extract-img-"));
    const pdf = join(dir, "img.pdf");
    await writeFile(pdf, makeImagePdf(200, 200));
    try {
      const { pages } = await extractPages(pdf);
      const imgs = pages.flatMap((p) => p.images);
      expect(imgs.length).toBeGreaterThanOrEqual(1);
      expect(imgs[0]!.dataBase64.length).toBeGreaterThan(0);
      expect(Buffer.from(imgs[0]!.dataBase64, "base64").length).toBeGreaterThan(0);
      // content references the extracted image via the ingest-rewritable token
      expect(pages.some((p) => p.content.includes("odl-image:"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
