import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { officeToPdf } from "./office.js";
import { extractPages } from "./extract.js";
import { makeDocx } from "./test-docx.js";

let hasLibreOffice = false;
try {
  execSync(`command -v ${process.env.LIBREOFFICE_BIN ?? "libreoffice"}`, { stdio: "ignore" });
  hasLibreOffice = true;
} catch {
  hasLibreOffice = false;
}

// Live: requires LibreOffice + a JVM on PATH.
describe.skipIf(!hasLibreOffice)("Office → PDF → markdown", () => {
  it("converts a .docx via LibreOffice and extracts its text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "office-test-"));
    try {
      const docx = join(dir, "report.docx");
      await writeFile(docx, makeDocx("Zoltaxian quarterly report covers interstellar trade volumes in detail."));
      const pdf = await officeToPdf(docx, dir);
      const { pages } = await extractPages(pdf);
      expect(pages.map((p) => p.content).join(" ")).toContain("Zoltaxian");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
