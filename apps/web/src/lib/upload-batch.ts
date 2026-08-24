export const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  "md", "txt", "csv", "pdf", "pptx", "ppt", "docx", "doc", "xlsx", "xls",
  "png", "jpg", "jpeg", "webp", "gif",
]);

export type DirectoryMapping = "preserve" | "flatten";
export type UploadExclusionReason = "unsupported" | "conflict";

export interface UploadCandidate {
  file: File;
  relativePath: string;
}

export interface ExistingUploadDocument {
  filename: string;
  path: string;
  archived?: boolean;
}

export interface UploadPreflightItem extends UploadCandidate {
  filename: string;
  destinationPath: string;
  reason: UploadExclusionReason | null;
}

export interface UploadPreflight {
  items: UploadPreflightItem[];
  summary: { total: number; eligible: number; unsupported: number; conflicts: number };
}

function normalizeDirectory(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

function destinationPath(candidate: UploadCandidate, currentPath: string, mapping: DirectoryMapping, stripRoot: boolean): string {
  if (mapping === "flatten") return normalizeDirectory(currentPath);
  const parts = candidate.relativePath.split("/").filter(Boolean);
  const parents = parts.slice(stripRoot ? 1 : 0, -1);
  const base = normalizeDirectory(currentPath);
  return parents.length === 0 ? base : `${base}${parents.join("/")}/`;
}

function destinationKey(path: string, filename: string): string {
  return `${normalizeDirectory(path)}${filename}`.toLowerCase();
}

/** Build the review shown before a multi-file or directory upload starts. */
export function buildUploadPreflight(
  candidates: UploadCandidate[],
  existingDocuments: ExistingUploadDocument[],
  currentPath: string,
  mapping: DirectoryMapping,
  stripRoot: boolean,
): UploadPreflight {
  const existing = new Set(
    existingDocuments
      .filter((document) => !document.archived)
      .map((document) => destinationKey(document.path, document.filename)),
  );
  const items: UploadPreflightItem[] = candidates.map((candidate) => {
    const extension = candidate.file.name.split(".").pop()?.toLowerCase() ?? "";
    const path = destinationPath(candidate, currentPath, mapping, stripRoot);
    return {
      ...candidate,
      filename: candidate.file.name,
      destinationPath: path,
      reason: SUPPORTED_UPLOAD_EXTENSIONS.has(extension) ? null : "unsupported",
    };
  });

  const destinations = new Map<string, UploadPreflightItem[]>();
  for (const item of items) {
    if (item.reason === "unsupported") continue;
    const key = destinationKey(item.destinationPath, item.filename);
    const group = destinations.get(key) ?? [];
    group.push(item);
    destinations.set(key, group);
  }
  for (const [key, group] of destinations) {
    if (existing.has(key) || group.length > 1) {
      for (const item of group) item.reason = "conflict";
    }
  }

  return {
    items,
    summary: {
      total: items.length,
      eligible: items.filter((item) => item.reason === null).length,
      unsupported: items.filter((item) => item.reason === "unsupported").length,
      conflicts: items.filter((item) => item.reason === "conflict").length,
    },
  };
}

/** Run async work with a fixed concurrency ceiling while preserving result order. */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("concurrency limit must be positive");
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
