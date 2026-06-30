/**
 * PDF → per-page markdown via the opendataloader Java CLI (same engine as the
 * Python converter, invoked through the official `@opendataloader/pdf` Node
 * wrapper — no Python).
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert } from "@opendataloader/pdf";
import { assemblePages, type PageContent } from "./markdown.js";

export async function extractPages(pdfPath: string): Promise<PageContent[]> {
  const outDir = await mkdtemp(join(tmpdir(), "odl-"));
  try {
    await convert(pdfPath, { outputDir: outDir, format: "json", quiet: true });
    const jsonFile = (await readdir(outDir)).find((f) => f.endsWith(".json"));
    if (!jsonFile) throw new Error("opendataloader produced no output");
    const data = JSON.parse(await readFile(join(outDir, jsonFile), "utf8")) as Record<string, unknown>;
    return assemblePages(data);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
