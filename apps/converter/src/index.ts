/**
 * Converter service (Node) — ports llmwiki `converter/main.py`.
 * POST /extract downloads an S3 source, converts Office→PDF via LibreOffice,
 * extracts PDF→markdown via the opendataloader Java CLI, returns per-page md.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { extractPages } from "./extract.js";
import { officeToPdf } from "./office.js";
import { downloadToFile } from "./download.js";
import { validateSourceUrl } from "./ssrf.js";

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const SUPPORTED = new Set([...OFFICE_EXTENSIONS, ...PDF_EXTENSIONS]);
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_EXTRACTIONS ?? "2");
const EXTRACT_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS ?? "300000");

/** Reject if `p` doesn't settle within `ms`, so a hung extraction releases its slot. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`extraction timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const SECRET = process.env.CONVERTER_SECRET ?? "";
const BUCKET = process.env.S3_BUCKET ?? "";
const ENDPOINT = process.env.S3_ENDPOINT ?? "";

if (!SECRET) throw new Error("CONVERTER_SECRET is required");

let active = 0;

function authorized(header: string | undefined): boolean {
  const expected = `Bearer ${SECRET}`;
  const got = header ?? "";
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/extract", async (c) => {
  if (!authorized(c.req.header("authorization"))) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    source_url?: string;
    source_ext?: string;
    request_id?: string;
  } | null;
  if (!body?.source_url || !body?.source_ext) return c.json({ error: "source_url and source_ext required" }, 400);

  const ext = body.source_ext.toLowerCase();
  if (!SUPPORTED.has(ext)) return c.json({ error: `Unsupported extension: ${ext}` }, 400);

  try {
    validateSourceUrl(body.source_url, { bucket: BUCKET, endpoint: ENDPOINT });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  if (active >= MAX_CONCURRENT) return c.json({ error: "Converter at capacity, retry shortly" }, 503);
  active++;
  const dir = await mkdtemp(join(tmpdir(), "convert-"));
  try {
    const sourcePath = join(dir, `source.${ext}`);
    // Hard timeout on the whole extraction: opendataloader's Java CLI has no
    // internal timeout, so a hung run would otherwise never release `active`
    // and wedge the converter at capacity permanently.
    const { pages, warnings } = await withTimeout(
      (async () => {
        await downloadToFile(body.source_url!, sourcePath, MAX_SOURCE_BYTES);
        const pdfPath = OFFICE_EXTENSIONS.has(ext) ? await officeToPdf(sourcePath, dir) : sourcePath;
        return extractPages(pdfPath, {
          maxImageBytes: process.env.MAX_IMAGE_BYTES ? Number(process.env.MAX_IMAGE_BYTES) : undefined,
          maxImagesPerPage: process.env.MAX_IMAGES_PER_PAGE ? Number(process.env.MAX_IMAGES_PER_PAGE) : undefined,
        });
      })(),
      EXTRACT_TIMEOUT_MS,
    );
    return c.json({
      pages,
      page_count: pages.length,
      ...(warnings.length ? { warnings } : {}),
      ...(body.request_id ? { request_id: body.request_id } : {}),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  } finally {
    active--;
    await rm(dir, { recursive: true, force: true });
  }
});

if (process.env.NODE_ENV !== "test") {
  // Cloud Run injects PORT; honor it over CONVERTER_PORT. Inlined (not the shared
  // resolvePort helper) to avoid adding a @team-kms/shared dep to the converter.
  const port = Number(process.env.PORT ?? process.env.CONVERTER_PORT ?? "8012");
  serve({ fetch: app.fetch, port });
  console.log(`converter listening on :${port}`);
}
