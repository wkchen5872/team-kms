/**
 * opendataloader JSON → per-page markdown, ported from the Python converter's
 * `_element_to_markdown` + `_extract_pages`.
 */

export type OdlElement = Record<string, unknown>;
export interface PageContent {
  page: number;
  content: string;
}

const MAX_PAGES = 10_000;

export function elementToMarkdown(el: OdlElement): string {
  const type = (el.type as string) ?? "";
  const content = (el.content as string) ?? "";

  switch (type) {
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
      const src = (el.source as string) ?? "";
      return src ? `![image](${src})` : "";
    }
    case "caption":
      return content ? `*${content}*` : "";
    default:
      return "";
  }
}

/** Assemble per-page markdown from an opendataloader JSON document. */
export function assemblePages(data: Record<string, unknown>): PageContent[] {
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

  const pages: PageContent[] = [];
  for (let p = 1; p <= total; p++) {
    const parts: string[] = [];
    for (const el of byPage.get(p) ?? []) {
      const md = elementToMarkdown(el);
      if (md) parts.push(md);
    }
    pages.push({ page: p, content: parts.join("\n\n") });
  }
  return pages;
}
