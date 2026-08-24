/**
 * Postgres + S3 implementation of the knowledge vault, ported from llmwiki
 * `mcp/vaultfs/postgres.py`.
 *
 * Adapted to the reduced schema (migrations 005/006/007 dropped): no
 * `highlights` column, and `document_chunks` carries only `content` (no
 * source_content/annotations_text/has_highlight), so `searchChunks` matches a
 * single PGroonga-indexed column and drops the annotation scope filters.
 */
import type pg from "pg";
import { createHash } from "node:crypto";
import { getPool, scopedQuery, scopedQueryRow, scopedExecute, serviceQueryRow, serviceExecute } from "./db.js";
import { chunkText, chunkPages, type Chunk } from "./chunker.js";
import { buildLookupMaps, extractReferences, type RefDoc } from "./references.js";
import { S3Service, s3FromConfig } from "./s3.js";
import { loadConfig } from "./config.js";

export class DuplicateDocumentError extends Error {
  constructor(
    public dirPath: string,
    public filename: string,
  ) {
    super(`document already exists at ${dirPath}${filename}`);
    this.name = "DuplicateDocumentError";
  }
}

export type DocumentKind = "raw" | "wiki" | "asset";

/** An image extracted by the converter (base64 bytes) awaiting asset storage. */
export interface ExtractedImage {
  /** converter-local id, e.g. "img-p1-1.png", referenced in page markdown as `odl-image:<id>` */
  id: string;
  dataBase64: string;
  format: string;
  /** OCR text, filled by the ingest layer (api) before finalize; optional. */
  ocrText?: string;
}

export interface KnowledgeBaseRow {
  id: string;
  name: string;
  slug: string;
  project_prompt?: string | null;
  [k: string]: unknown;
}

export interface DocumentRow {
  id: string;
  filename: string;
  title: string | null;
  path: string;
  file_type: string;
  [k: string]: unknown;
}

const OVERVIEW_TEMPLATE = (name: string, date: string): string => `---
title: Overview
description: Research hub for ${name}.
date: ${date}
tags: [overview, wiki]
---

This wiki tracks research on ${name}. No sources have been ingested yet.

## Key Findings

No sources ingested yet - add your first source to get started.

## Recent Updates

No activity yet.`;

const LOG_TEMPLATE = (name: string, date: string): string => `Chronological record of ingests, queries, and maintenance passes.

## [${date}] created | Wiki Created
- Initialized wiki: ${name}`;

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "kb";
}

/** Replace a document's chunks (service-role, inside the caller's transaction). */
async function storeChunksOnClient(
  client: pg.PoolClient,
  documentId: string,
  userId: string,
  kbId: string,
  chunks: Chunk[],
): Promise<void> {
  await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
  if (chunks.length === 0) return;
  const rows: string[] = [];
  const params: unknown[] = [];
  chunks.forEach((c, i) => {
    const o = i * 9;
    rows.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`);
    params.push(documentId, userId, kbId, c.index, c.content, c.page, c.startChar, c.tokenCount, c.headerBreadcrumb);
  });
  await client.query(
    "INSERT INTO document_chunks " +
      "(document_id, user_id, knowledge_base_id, chunk_index, content, page, start_char, token_count, header_breadcrumb) " +
      `VALUES ${rows.join(",")}`,
    params,
  );
}

const DOC_SELECT =
  "id, user_id, filename, title, path, content, tags, version, file_type, page_count, metadata, date, created_at, updated_at";

export class PostgresVaultFS {
  readonly userId: string;
  private readonly s3: S3Service | null;
  private readonly bucket: string;

  constructor(userId: string, opts: { s3?: S3Service } = {}) {
    this.userId = userId;
    const cfg = loadConfig();
    this.bucket = cfg.S3_BUCKET ?? "";
    this.s3 = opts.s3 ?? (this.bucket ? s3FromConfig(cfg) : null);
  }

  // ── Knowledge bases ──────────────────────────────────────────────
  /** Resolve a KB by slug OR id (UUID) — the web passes either. */
  async resolveKb(slugOrId: string): Promise<KnowledgeBaseRow | null> {
    return scopedQueryRow<KnowledgeBaseRow>(
      this.userId,
      "SELECT id, name, slug, project_prompt FROM knowledge_bases WHERE (slug = $1 OR id::text = $1) AND user_id = $2",
      [slugOrId, this.userId],
    );
  }

  async listKnowledgeBases(): Promise<KnowledgeBaseRow[]> {
    return scopedQuery<KnowledgeBaseRow>(
      this.userId,
      "SELECT id, name, slug, project_prompt, created_at FROM knowledge_bases WHERE user_id = $1 ORDER BY created_at DESC",
      [this.userId],
    );
  }

  async renameKnowledgeBase(id: string, name: string): Promise<KnowledgeBaseRow | null> {
    // knowledge_bases has only a SELECT RLS policy → service-role, scoped by user_id.
    return serviceQueryRow<KnowledgeBaseRow>(
      "UPDATE knowledge_bases SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3 " +
        "RETURNING id, name, slug",
      [name, id, this.userId],
    );
  }

  async updateKnowledgeBasePrompt(id: string, prompt: string | null): Promise<KnowledgeBaseRow | null> {
    // knowledge_bases has only a SELECT RLS policy → service-role, scoped by user_id.
    // Blank / whitespace-only clears the overlay (store NULL).
    const value = prompt && prompt.trim() ? prompt : null;
    return serviceQueryRow<KnowledgeBaseRow>(
      "UPDATE knowledge_bases SET project_prompt = $1, updated_at = now() WHERE id = $2 AND user_id = $3 " +
        "RETURNING id, name, slug, project_prompt",
      [value, id, this.userId],
    );
  }

  async deleteKnowledgeBase(id: string): Promise<number> {
    // Cascade removes documents/chunks/pages/references.
    return serviceExecute("DELETE FROM knowledge_bases WHERE id = $1 AND user_id = $2", [id, this.userId]);
  }

  async createKnowledgeBase(name: string, description?: string | null): Promise<KnowledgeBaseRow> {
    const row = await this.insertKnowledgeBase(name, description ?? null);
    await this.scaffoldWiki(row.id, row.name);
    return row;
  }

  // ── Documents ────────────────────────────────────────────────────
  async getDocument(kbId: string, filename: string, dirPath: string): Promise<DocumentRow | null> {
    return scopedQueryRow<DocumentRow>(
      this.userId,
      `SELECT ${DOC_SELECT} FROM documents ` +
        "WHERE knowledge_base_id = $1 AND filename = $2 AND path = $3 AND NOT archived AND user_id = $4",
      [kbId, filename, dirPath, this.userId],
    );
  }

  async getDocumentById(docId: string): Promise<DocumentRow | null> {
    return scopedQueryRow<DocumentRow>(
      this.userId,
      `SELECT ${DOC_SELECT}, knowledge_base_id, page_count FROM documents WHERE id = $1 AND user_id = $2 AND NOT archived`,
      [docId, this.userId],
    );
  }

  async findDocumentByName(kbId: string, name: string): Promise<DocumentRow | null> {
    return scopedQueryRow<DocumentRow>(
      this.userId,
      `SELECT ${DOC_SELECT} FROM documents ` +
        "WHERE knowledge_base_id = $1 AND (filename = $2 OR title = $2) AND NOT archived AND user_id = $3",
      [kbId, name, this.userId],
    );
  }

  /** Dedup lookup: an active document in this KB with the same raw-bytes hash. */
  async findByFileHash(kbId: string, fileHash: string): Promise<{ id: string; filename: string; path: string } | null> {
    return scopedQueryRow<{ id: string; filename: string; path: string }>(
      this.userId,
      "SELECT id, filename, path FROM documents " +
        "WHERE knowledge_base_id = $1 AND file_hash = $2 AND NOT archived AND user_id = $3 LIMIT 1",
      [kbId, fileHash, this.userId],
    );
  }

  async createDocument(
    kbId: string,
    filename: string,
    title: string,
    dirPath: string,
    fileType: string,
    content: string,
    tags: string[],
    date?: string | null,
    metadata?: Record<string, unknown> | null,
    parser?: string | null,
    kind?: DocumentKind,
    fileHash?: string | null,
  ): Promise<{ id: string; filename: string; path: string }> {
    const resolvedKind: DocumentKind = kind ?? (dirPath.startsWith("/wiki/") ? "wiki" : "raw");
    const fileSize = Buffer.byteLength(content ?? "", "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      let row: { id: string; filename: string; path: string } | undefined;
      try {
        const res = await client.query<{ id: string; filename: string; path: string }>(
          "INSERT INTO documents (knowledge_base_id, user_id, filename, title, path, " +
            "file_type, kind, status, content, tags, date, metadata, file_size, file_hash, version) " +
            "SELECT $1, $2, $3, $4, $5, $6, $7, 'ready', $8, $9, $10, $11::jsonb, $12, $13, 1 " +
            "WHERE EXISTS (SELECT 1 FROM knowledge_bases WHERE id = $1 AND user_id = $2) " +
            "RETURNING id, filename, path",
          [kbId, this.userId, filename, title, dirPath, fileType, resolvedKind, content, tags, date ?? null, metadata ? JSON.stringify(metadata) : null, fileSize, fileHash ?? null],
        );
        row = res.rows[0];
      } catch (err) {
        if (isUniqueViolation(err, "idx_documents_unique_active")) {
          throw new DuplicateDocumentError(dirPath, filename);
        }
        throw err;
      }
      if (!row) throw new Error(`knowledge base ${kbId} not owned by user`);
      // Raw sources carry a 1:1 document_raw detail row (parser/error_message).
      if (resolvedKind === "raw") {
        await client.query("INSERT INTO document_raw (document_id, parser) VALUES ($1, $2)", [row.id, parser ?? null]);
      }
      if (fileType === "md" || fileType === "txt" || fileType === "csv") {
        await storeChunksOnClient(client, row.id, this.userId, kbId, chunkText(content || ""));
      }
      await client.query("COMMIT");
      return row;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async updateDocument(
    docId: string,
    content: string,
    opts: { tags?: string[]; title?: string; date?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<{ id: string; filename: string; path: string } | null> {
    const sets = ["content = $1", "version = COALESCE(version, 0) + 1", "updated_at = now()"];
    const args: unknown[] = [content, docId, this.userId];
    let idx = 4;
    if (opts.title !== undefined) {
      sets.push(`title = $${idx++}`);
      args.push(opts.title);
    }
    if (opts.tags !== undefined) {
      sets.push(`tags = $${idx++}`);
      args.push(opts.tags);
    }
    if (opts.date !== undefined) {
      sets.push(`date = $${idx++}`);
      args.push(opts.date);
    }
    if (opts.metadata !== undefined) {
      sets.push(`metadata = $${idx++}::jsonb`);
      args.push(JSON.stringify(opts.metadata));
    }

    const sql =
      `UPDATE documents SET ${sets.join(", ")} WHERE id = $2 AND user_id = $3 ` +
      "RETURNING id, filename, path, knowledge_base_id, file_type";

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<{
        id: string;
        filename: string;
        path: string;
        knowledge_base_id: string;
        file_type: string;
      }>(sql, args);
      const row = res.rows[0];
      if (row && (row.file_type === "md" || row.file_type === "txt" || row.file_type === "csv")) {
        await storeChunksOnClient(client, row.id, this.userId, row.knowledge_base_id, chunkText(content || ""));
      }
      await client.query("COMMIT");
      return row ? { id: row.id, filename: row.filename, path: row.path } : null;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Create a source document in `pending` status (content filled later by extraction). */
  async createPendingDocument(
    kbId: string,
    filename: string,
    title: string,
    dirPath: string,
    fileType: string,
    metadata?: Record<string, unknown> | null,
    fileSize = 0,
    fileHash?: string | null,
  ): Promise<{ id: string; filename: string; path: string }> {
    // Binary sources are always kind='raw' and get their document_raw detail row
    // atomically (parser/error_message filled later by finalizeExtractedDocument).
    const row = await serviceQueryRow<{ id: string; filename: string; path: string }>(
      "WITH new_doc AS (" +
        "INSERT INTO documents (knowledge_base_id, user_id, filename, title, path, file_type, kind, status, metadata, file_size, file_hash, version) " +
        "SELECT $1, $2, $3, $4, $5, $6, 'raw', 'pending', $7::jsonb, $8, $9, 1 " +
        "WHERE EXISTS (SELECT 1 FROM knowledge_bases WHERE id = $1 AND user_id = $2) " +
        "RETURNING id, filename, path" +
      "), _raw AS (INSERT INTO document_raw (document_id) SELECT id FROM new_doc) " +
      "SELECT id, filename, path FROM new_doc",
      [kbId, this.userId, filename, title, dirPath, fileType, metadata ? JSON.stringify(metadata) : null, fileSize, fileHash ?? null],
    );
    if (!row) throw new Error(`knowledge base ${kbId} not owned by user`);
    return row;
  }

  /** Store extracted pages, assemble content, mark ready, and (re)chunk. */
  async finalizeExtractedDocument(
    docId: string,
    kbId: string,
    pages: { page: number; content: string; images?: ExtractedImage[] }[],
  ): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM document_pages WHERE document_id = $1", [docId]);
      const finalized: [number, string][] = [];
      for (const p of pages) {
        // Store each embedded image as an asset, rewrite `odl-image:<id>` tokens to
        // `asset:<assetDocId>`, and record image refs in the page's elements JSON.
        const { content, elements } = await this.persistPageImages(client, docId, kbId, p.content, p.images ?? []);
        await client.query(
          "INSERT INTO document_pages (document_id, page, content, elements) VALUES ($1, $2, $3, $4::jsonb)",
          [docId, p.page, content, elements ? JSON.stringify(elements) : null],
        );
        finalized.push([p.page, content]);
      }
      await client.query(
        "UPDATE documents SET content = $1, page_count = $2, status = 'ready', updated_at = now() " +
          "WHERE id = $3 AND user_id = $4",
        [finalized.map(([, c]) => c).join("\n\n"), pages.length, docId, this.userId],
      );
      // parser lives in the document_raw detail table (row created at pending time).
      await client.query("UPDATE document_raw SET parser = 'opendataloader' WHERE document_id = $1", [docId]);
      await storeChunksOnClient(client, docId, this.userId, kbId, chunkPages(finalized));
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Mark a directly-uploaded raster image document ready (no converter pages).
   *  If OCR text is supplied it becomes the doc content and is chunked for search. */
  async finalizeImageDocument(docId: string, kbId?: string, ocrText?: string): Promise<void> {
    const text = (ocrText ?? "").trim();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE documents SET status = 'ready', content = $1, updated_at = now() WHERE id = $2 AND user_id = $3",
        [text, docId, this.userId],
      );
      await client.query("UPDATE document_raw SET parser = $2 WHERE document_id = $1", [docId, text ? "ocr" : "none"]);
      if (text && kbId) await storeChunksOnClient(client, docId, this.userId, kbId, chunkText(text));
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Persist a page's embedded images as asset documents (deduped by file_hash),
   * upload bytes to Storage, rewrite `odl-image:<localId>` tokens in the markdown
   * to `asset:<assetDocId>`, and return the page's `{images:[...]}` elements.
   * If Storage isn't configured the image tokens are stripped (no assets created).
   */
  private async persistPageImages(
    client: pg.PoolClient,
    parentDocId: string,
    kbId: string,
    content: string,
    images: ExtractedImage[],
  ): Promise<{ content: string; elements: { images: { id: string; src: string; filename: string }[] } | null }> {
    if (!images.length) return { content, elements: null };
    if (!this.s3) {
      // No Storage → drop the image links rather than leave dangling tokens.
      const stripped = content.replace(/!\[image\]\(odl-image:[^)]+\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
      return { content: stripped, elements: null };
    }
    let out = content;
    const refs: { id: string; src: string; filename: string }[] = [];
    const ocrTexts: string[] = [];
    for (const img of images) {
      const bytes = Buffer.from(img.dataBase64, "base64");
      const fileHash = createHash("sha256").update(bytes).digest("hex");
      const ocr = (img.ocrText ?? "").trim();
      const asset = await client.query<{ id: string; filename: string }>(
        "SELECT id, filename FROM documents WHERE knowledge_base_id = $1 AND file_hash = $2 " +
          "AND kind = 'asset' AND user_id = $3 LIMIT 1",
        [kbId, fileHash, this.userId],
      );
      let assetId: string;
      let filename: string;
      if (asset.rows[0]) {
        assetId = asset.rows[0].id;
        filename = asset.rows[0].filename;
      } else {
        filename = `${fileHash.slice(0, 12)}.${img.format}`;
        const ins = await client.query<{ id: string }>(
          "INSERT INTO documents (knowledge_base_id, user_id, filename, title, path, file_type, kind, " +
            "status, content, tags, metadata, file_size, file_hash, version) " +
            "VALUES ($1, $2, $3, $3, '/.assets/', $4, 'asset', 'ready', $5, '{}', $6::jsonb, $7, $8, 1) RETURNING id",
          [
            kbId,
            this.userId,
            filename,
            img.format,
            ocr,
            JSON.stringify({ hidden: true, parent_document_id: parentDocId, kind: "pdf_image" }),
            bytes.length,
            fileHash,
          ],
        );
        assetId = ins.rows[0]!.id;
        await client.query("INSERT INTO document_raw (document_id) VALUES ($1)", [assetId]);
        await this.s3.uploadBytes(`${this.userId}/${assetId}/source.${img.format}`, bytes, `image/${img.format}`);
      }
      const src = `asset:${assetId}`;
      out = out.split(`odl-image:${img.id}`).join(src);
      refs.push({ id: assetId, src, filename });
      if (ocr) ocrTexts.push(ocr);
    }
    // Append OCR text to the page so image-borne content (tables/flowcharts) is chunked + searchable.
    if (ocrTexts.length) out = `${out}\n\n${ocrTexts.join("\n\n")}`.trim();
    return { content: out, elements: { images: refs } };
  }

  async archiveDocuments(docIds: string[]): Promise<number> {
    return serviceExecute(
      "UPDATE documents SET archived = true, updated_at = now() WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [docIds, this.userId],
    );
  }

  /** Normalize a folder path to a `/…/` prefix (leading + trailing slash). */
  private static folderPrefix(path: string): string {
    let p = path.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    if (!p.endsWith("/")) p = `${p}/`;
    return p;
  }

  /** Delete a (virtual) folder: archive every active document under its path prefix.
   *  Folders are path prefixes, not rows. Returns the number of documents archived. */
  async deleteFolder(kbId: string, path: string): Promise<number> {
    const prefix = PostgresVaultFS.folderPrefix(path);
    return serviceExecute(
      "UPDATE documents SET archived = true, updated_at = now() " +
        "WHERE knowledge_base_id = $1 AND user_id = $2 AND NOT archived AND path LIKE $3 || '%'",
      [kbId, this.userId, prefix],
    );
  }

  /** Rename a (virtual) folder: rewrite the path prefix of every descendant document
   *  from oldName to newName at the same parent level. Returns rows updated. */
  async renameFolder(kbId: string, path: string, newName: string): Promise<number> {
    const oldPrefix = PostgresVaultFS.folderPrefix(path);
    const parent = oldPrefix.slice(0, oldPrefix.slice(0, -1).lastIndexOf("/") + 1); // parent dir incl. trailing slash
    const newPrefix = PostgresVaultFS.folderPrefix(`${parent}${newName}`);
    return serviceExecute(
      "UPDATE documents SET path = $4 || substring(path from length($3) + 1), updated_at = now() " +
        "WHERE knowledge_base_id = $1 AND user_id = $2 AND path LIKE $3 || '%'",
      [kbId, this.userId, oldPrefix, newPrefix],
    );
  }

  async listDocuments(kbId: string): Promise<DocumentRow[]> {
    return scopedQuery<DocumentRow>(
      this.userId,
      "SELECT d.id, d.filename, d.title, d.path, d.file_type, d.kind, d.tags, d.status, " +
        "d.document_number, d.version, d.sort_order, d.metadata, d.file_size, d.page_count, " +
        "d.date, d.created_at, d.updated_at, dr.error_message " +
        "FROM documents d LEFT JOIN document_raw dr ON dr.document_id = d.id " +
        "WHERE d.knowledge_base_id = $1 AND NOT d.archived AND d.user_id = $2 " +
        "AND d.kind <> 'asset' ORDER BY d.path, d.filename",
      [kbId, this.userId],
    );
  }

  /** Move (change path) — targeted UPDATE, not updateDocument (which re-chunks).
   *  documents has only a SELECT RLS policy → writes go through service-role, scoped by user_id. */
  async moveDocument(docId: string, path: string): Promise<{ id: string; filename: string; path: string } | null> {
    return serviceQueryRow<{ id: string; filename: string; path: string }>(
      "UPDATE documents SET path = $1, updated_at = now() WHERE id = $2 AND user_id = $3 " +
        "RETURNING id, filename, path",
      [path, docId, this.userId],
    );
  }

  async renameDocument(docId: string, title: string): Promise<{ id: string; filename: string; path: string } | null> {
    return serviceQueryRow<{ id: string; filename: string; path: string }>(
      "UPDATE documents SET title = $1, updated_at = now() WHERE id = $2 AND user_id = $3 " +
        "RETURNING id, filename, path",
      [title, docId, this.userId],
    );
  }

  /** Create a markdown note/folder from the web; returns a full listDocuments-shaped row. */
  async createNote(
    kbId: string,
    opts: { filename: string; path: string; title?: string; content?: string },
  ): Promise<DocumentRow | null> {
    const title = opts.title ?? opts.filename.replace(/\.[^.]+$/, "");
    const doc = await this.createDocument(kbId, opts.filename, title, opts.path, "md", opts.content ?? "", []);
    return scopedQueryRow<DocumentRow>(
      this.userId,
      "SELECT d.id, d.filename, d.title, d.path, d.file_type, d.kind, d.tags, d.status, " +
        "d.document_number, d.version, d.sort_order, d.metadata, d.file_size, d.page_count, " +
        "d.date, d.created_at, d.updated_at, dr.error_message " +
        "FROM documents d LEFT JOIN document_raw dr ON dr.document_id = d.id " +
        "WHERE d.id = $1 AND d.user_id = $2",
      [doc.id, this.userId],
    );
  }

  async listDocumentsWithContent(kbId: string): Promise<DocumentRow[]> {
    return scopedQuery<DocumentRow>(
      this.userId,
      "SELECT id, filename, title, path, content, tags, file_type, page_count, metadata, date " +
        "FROM documents WHERE knowledge_base_id = $1 AND NOT archived AND user_id = $2 " +
        "AND kind <> 'asset' ORDER BY path, filename",
      [kbId, this.userId],
    );
  }

  // ── Pages ────────────────────────────────────────────────────────
  async getPages(docId: string, pageNums: number[]): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT page, content, elements FROM document_pages WHERE document_id = $1 AND page = ANY($2) ORDER BY page",
      [docId, pageNums],
    );
  }

  async getAllPages(docId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT page, content, elements FROM document_pages WHERE document_id = $1 ORDER BY page",
      [docId],
    );
  }

  // ── Search ───────────────────────────────────────────────────────
  async searchChunks(
    kbId: string,
    query: string,
    limit: number,
    pathFilter?: "wiki" | "sources" | null,
  ): Promise<Record<string, unknown>[]> {
    let pathClause = "";
    if (pathFilter === "wiki") pathClause = " AND d.path LIKE '/wiki/%'";
    else if (pathFilter === "sources") pathClause = " AND d.path NOT LIKE '/wiki/%'";

    return scopedQuery(
      this.userId,
      "SELECT dc.content, dc.page, dc.header_breadcrumb, dc.chunk_index, " +
        "  pgroonga_score(dc.tableoid, dc.ctid) AS score, " +
        "  d.filename, d.title, d.path, d.file_type, d.tags " +
        "FROM document_chunks dc JOIN documents d ON dc.document_id = d.id " +
        "WHERE dc.knowledge_base_id = $1 AND dc.content &@~ $2 AND NOT d.archived AND d.user_id = $3" +
        pathClause +
        " ORDER BY score DESC, dc.chunk_index LIMIT $4",
      [kbId, query, this.userId, limit],
    );
  }

  // ── S3 assets ────────────────────────────────────────────────────
  async loadSourceBytes(doc: { id: string; file_type?: string }): Promise<Buffer | null> {
    return this.loadS3(`${this.userId}/${doc.id}/source.${doc.file_type ?? ""}`);
  }

  async loadImageBytes(docId: string, imageId: string): Promise<Buffer | null> {
    return this.loadS3(`${this.userId}/${docId}/images/${imageId}`);
  }

  async loadAssetBytes(assetDocId: string): Promise<Buffer | null> {
    const row = await scopedQueryRow<DocumentRow>(
      this.userId,
      "SELECT id, user_id, filename, file_type FROM documents WHERE id = $1 AND user_id = $2 AND NOT archived",
      [assetDocId, this.userId],
    );
    return row ? this.loadSourceBytes(row) : null;
  }

  private async loadS3(key: string): Promise<Buffer | null> {
    if (!this.s3) return null;
    try {
      return await this.s3.downloadBytes(key);
    } catch {
      return null;
    }
  }

  // ── References / graph ───────────────────────────────────────────
  async deleteReferences(sourceDocId: string): Promise<void> {
    await scopedExecute(
      this.userId,
      "DELETE FROM document_references WHERE source_document_id = $1",
      [sourceDocId],
    );
  }

  async upsertReference(
    sourceId: string,
    targetId: string,
    kbId: string,
    refType: string,
    page: number | null,
  ): Promise<void> {
    await scopedExecute(
      this.userId,
      "INSERT INTO document_references " +
        "(source_document_id, target_document_id, knowledge_base_id, reference_type, page) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (source_document_id, target_document_id, reference_type) DO UPDATE " +
        "SET page = EXCLUDED.page, created_at = now()",
      [sourceId, targetId, kbId, refType, page],
    );
  }

  /**
   * Recompute all citation/link edges for a KB's wiki pages with the current
   * parser and replace existing edges. Used to backfill after a parser fix
   * (existing pages don't re-parse until edited otherwise).
   */
  async rebuildReferences(kbId: string): Promise<{ pages: number; edges: number }> {
    const docs = await this.listDocumentsWithContent(kbId);
    const maps = buildLookupMaps(docs as unknown as RefDoc[]);
    let pages = 0;
    let edges = 0;
    for (const d of docs) {
      if (!d.path?.startsWith("/wiki/")) continue; // only wiki pages cite/link
      const content = ((d as { content?: string }).content ?? "") as string;
      const wikiDir = d.path.replace("/wiki/", "");
      const eList = extractReferences(content, d.id, wikiDir, maps.filenameToDoc, maps.baseToDoc, maps.wikiPathToDoc);
      await this.deleteReferences(d.id);
      for (const e of eList) {
        await this.upsertReference(d.id, e.targetId, kbId, e.type, e.page);
        edges++;
      }
      pages++;
    }
    return { pages, edges };
  }

  async propagateStaleness(docId: string): Promise<void> {
    await serviceExecute(
      "UPDATE documents SET stale_since = now() WHERE id IN (" +
        "SELECT source_document_id FROM document_references WHERE target_document_id = $1 AND reference_type = 'links_to'" +
        ") AND stale_since IS NULL AND user_id = $2",
      [docId, this.userId],
    );
  }

  async getBacklinks(docId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT d.path, d.filename, d.title, dr.reference_type FROM document_references dr " +
        "JOIN documents d ON dr.source_document_id = d.id " +
        "WHERE dr.target_document_id = $1 AND NOT d.archived AND d.user_id = $2 ORDER BY d.path, d.filename",
      [docId, this.userId],
    );
  }

  async getForwardReferences(docId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT d.id, d.filename, d.title, d.path, dr.reference_type, dr.page FROM document_references dr " +
        "JOIN documents d ON dr.target_document_id = d.id " +
        "WHERE dr.source_document_id = $1 AND NOT d.archived AND d.user_id = $2 " +
        "ORDER BY dr.reference_type, d.path, d.filename",
      [docId, this.userId],
    );
  }

  async findUncitedSources(kbId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT d.filename, d.title, d.path, d.file_type FROM documents d " +
        "WHERE d.knowledge_base_id = $1 AND NOT d.archived AND d.user_id = $2 AND d.path NOT LIKE '/wiki/%' " +
        "AND d.id NOT IN (SELECT target_document_id FROM document_references WHERE reference_type = 'cites') " +
        "ORDER BY d.filename",
      [kbId, this.userId],
    );
  }

  /** All reference edges in a KB, for graph rendering. */
  async listReferences(kbId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT source_document_id, target_document_id, reference_type, page " +
        "FROM document_references WHERE knowledge_base_id = $1",
      [kbId],
    );
  }

  async findStalePages(kbId: string): Promise<Record<string, unknown>[]> {
    return scopedQuery(
      this.userId,
      "SELECT d.filename, d.title, d.path, d.stale_since FROM documents d " +
        "WHERE d.knowledge_base_id = $1 AND NOT d.archived AND d.user_id = $2 AND d.stale_since IS NOT NULL " +
        "ORDER BY d.stale_since DESC",
      [kbId, this.userId],
    );
  }

  // ── internals ────────────────────────────────────────────────────
  private async insertKnowledgeBase(
    name: string,
    description: string | null,
  ): Promise<KnowledgeBaseRow> {
    let currentName = name;
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = await this.uniqueSlug(currentName);
      try {
        // Service-role: knowledge_bases has only a SELECT policy, so inserts
        // run as the owner (RLS bypass) with an explicit user_id, matching the
        // upstream get_pool() path.
        const row = await serviceQueryRow<KnowledgeBaseRow>(
          "INSERT INTO knowledge_bases (user_id, name, slug, description) VALUES ($1, $2, $3, $4) " +
            "RETURNING id, user_id, name, slug, description, created_at, updated_at",
          [this.userId, currentName, slug, description],
        );
        return row!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          currentName = `${name} (${attempt + 2})`;
          continue;
        }
        throw err;
      }
    }
    throw new Error("Could not create knowledge base after too many duplicate names");
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let counter = 2;
    while (
      await serviceQueryRow("SELECT 1 FROM knowledge_bases WHERE slug = $1 AND user_id = $2", [slug, this.userId])
    ) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private async scaffoldWiki(kbId: string, name: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.createDocument(kbId, "overview.md", "Overview", "/wiki/", "md", OVERVIEW_TEMPLATE(name, today), ["overview", "wiki"], today, {
      description: `Research hub for ${name}.`,
    });
    await this.createDocument(kbId, "log.md", "Log", "/wiki/", "md", LOG_TEMPLATE(name, today), ["log"]);
  }
}

function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  if (e?.code !== "23505") return false;
  return constraint ? e.constraint === constraint : true;
}
