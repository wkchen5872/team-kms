/**
 * opendataloader JSON → per-page markdown, ported from the Python converter's
 * `_element_to_markdown` + `_extract_pages`. Embedded images (data URIs, from
 * `imageOutput: "embedded"`) are pulled out as bytes and referenced by a stable
 * `odl-image:<id>` token that ingest later rewrites to the stored asset path.
 */

export type OdlElement = Record<string, unknown>;
export interface PageImage {
  id: string;
  dataBase64: string;
  format: string;
}
export interface PageContent {
  page: number;
  content: string;
  images: PageImage[];
}
export interface AssembleOptions {
  /** Max decoded bytes per image; larger images are skipped with a warning. */
  maxImageBytes?: number;
  /** Max images kept per page; extras are skipped with a warning. */
  maxImagesPerPage?: number;
}

const MAX_PAGES = 10_000;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_IMAGES_PER_PAGE = 30;

/** Parse a `data:image/<fmt>;base64,<payload>` URI. Returns null if not a data URI. */
function parseDataUri(src: string): { base64: string; format: string } | null {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(src);
  if (!m) return null;
  return { format: m[1]!.toLowerCase(), base64: m[2]! };
}

/** Flatten a table cell's child paragraphs to a single pipe-safe line. */
function cellText(cell: OdlElement): string {
  const kids = (cell.kids as OdlElement[]) ?? [];
  return kids
    .map((k) => (k.content as string) ?? "")
    .join(" ")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** opendataloader `table` (rows → cells → paragraphs) → GFM markdown table. */
function tableToMarkdown(el: OdlElement): string {
  const rows = (el.rows as OdlElement[]) ?? [];
  const matrix = rows.map((r) => ((r.cells as OdlElement[]) ?? []).map(cellText));
  if (!matrix.length) return "";
  const cols = Math.max(1, ...matrix.map((r) => r.length));
  const pad = (r: string[]) => { const c = [...r]; while (c.length < cols) c.push(""); return c; };
  const lines = [
    `| ${pad(matrix[0]!).join(" | ")} |`,
    `| ${Array(cols).fill("---").join(" | ")} |`,
    ...matrix.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function elementToMarkdown(el: OdlElement): string {
  const type = (el.type as string) ?? "";
  const content = (el.content as string) ?? "";

  switch (type) {
    case "table":
      return tableToMarkdown(el);
    case "heading": {
      const raw = el["heading level"];
      const level = Math.max(1, Math.min(typeof raw === "number" ? raw : 1, 6));
      return `${"#".repeat(level)} ${content}`;
    }
    case "paragraph":
      return content;
    case "list": {
      const lines: string[] = [];
      for (const item of (el["list items"] as OdlElement[]) ?? []) {
        lines.push(`- ${(item.content as string) ?? ""}`);
        for (const child of (item.kids as OdlElement[]) ?? []) {
          lines.push(`  - ${(child.content as string) ?? ""}`);
        }
      }
      return lines.join("\n");
    }
    case "image": {
      // Embedded (data-URI) images are handled in assemblePages (needs page context
      // to allocate ids). Here we only render external/plain references verbatim.
      const src = (el.source as string) ?? "";
      return src ? `![image](${src})` : "";
    }
    case "caption":
      return content ? `*${content}*` : "";
    default:
      return "";
  }
}

/** Assemble per-page markdown + extracted embedded images from opendataloader JSON. */
export function assemblePages(
  data: Record<string, unknown>,
  opts: AssembleOptions = {},
): { pages: PageContent[]; warnings: string[] } {
  const maxImageBytes = opts.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const maxImagesPerPage = opts.maxImagesPerPage ?? DEFAULT_MAX_IMAGES_PER_PAGE;

  const rawTotal = data["number of pages"];
  const valid = typeof rawTotal === "number" && Number.isInteger(rawTotal) && rawTotal >= 0;
  const total = Math.min(valid ? rawTotal : 0, MAX_PAGES);

  const byPage = new Map<number, OdlElement[]>();
  for (const el of (data.kids as OdlElement[]) ?? []) {
    const pageNum = el["page number"] as number | undefined;
    const type = el.type as string;
    if (pageNum == null || type === "header" || type === "footer") continue;
    const list = byPage.get(pageNum) ?? [];
    list.push(el);
    byPage.set(pageNum, list);
  }

  const warnings: string[] = [];
  const pages: PageContent[] = [];
  for (let p = 1; p <= total; p++) {
    const parts: string[] = [];
    const images: PageImage[] = [];
    for (const el of byPage.get(p) ?? []) {
      if ((el.type as string) === "image") {
        // opendataloader (imageOutput=embedded) emits the image as a `data` data-URI
        // plus a `format` field (NOT `source`, which is only a path in external mode).
        const parsed = parseDataUri((el.data as string) ?? "");
        if (parsed) {
          const format = ((el.format as string) || parsed.format).toLowerCase();
          if (images.length >= maxImagesPerPage) {
            warnings.push(`page ${p}: image count exceeded ${maxImagesPerPage}, skipping extra image(s)`);
            continue;
          }
          const bytes = Buffer.from(parsed.base64, "base64").length;
          if (bytes > maxImageBytes) {
            warnings.push(`page ${p}: image ${images.length + 1} is ${bytes} bytes (> ${maxImageBytes}), skipped`);
            continue;
          }
          const id = `img-p${p}-${images.length + 1}.${format}`;
          images.push({ id, dataBase64: parsed.base64, format });
          parts.push(`![image](odl-image:${id})`);
          continue;
        }
      }
      const md = elementToMarkdown(el);
      if (md) parts.push(md);
    }
    pages.push({ page: p, content: parts.join("\n\n"), images });
  }
  return { pages, warnings };
}
