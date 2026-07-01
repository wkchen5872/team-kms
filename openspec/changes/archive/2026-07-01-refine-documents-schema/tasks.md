## 1. Migrations（forward-only 時間戳；每支附 grant + RLS）

- [x] 1.1 Migration：`documents.kind`（nullable 起步）+ 回填（`path LIKE '/wiki/%'`→`wiki`，其餘→`raw`）+ 設 `NOT NULL DEFAULT 'raw'` + `CHECK (kind IN ('raw','wiki','asset'))` + index
- [x] 1.2 Migration：`documents.file_hash TEXT` + index（既有列留 NULL）
- [x] 1.3 Migration（加法部分）：建 `document_raw (document_id PK REFERENCES documents(id) ON DELETE CASCADE, parser, error_message)` + `grant to service_role` + RLS；搬既有值。**`page_count` 留 base**（熱路徑）。base 的 `DROP COLUMN parser/error_message` 延後到 §5 contract migration（改完程式碼後才 drop）
- [x] 1.4 Migration：建 `sources`（join document_raw, `WHERE kind='raw' AND NOT archived`）與 `wiki_pages`（`WHERE kind='wiki' AND NOT archived`）唯讀 view
- [x] 1.5 本機套用：`supabase migration up` 無 drift；kind raw=80/wiki=23、總數 103 不變、每筆 raw 有 `document_raw` 列（80）、views 79/21 ✓

## 2. Shared 資料層（`packages/shared/src/vaultfs.ts`）

- [x] 2.1 測試(紅→綠)：raw/wiki/asset 三入口 kind 正確；raw 產生 `document_raw` 列（parser）；wiki 無 `document_raw` 列；svg asset 不出現在 listing
- [x] 2.2 `createDocument`（加 kind 參數，raw 時 INSERT document_raw）/ `createPendingDocument`（CTE 原子建 doc kind='raw' + document_raw）/ `finalizeExtractedDocument`（parser 寫 document_raw；page_count 留 base）；`jobs.ts` 失敗時 error_message 寫 document_raw
- [x] 2.3 `listDocuments` / `listDocumentsWithContent`：隱藏濾網改 `kind <> 'asset'`（這兩個方法本就不 select parser/error_message，無需 join）
- [x] 2.4 測試(綠)：vaultfs 11/11 綠、shared+api typecheck 通過

## 3. API ingest（`apps/api/src/ingest.ts`）

- [x] 3.1 測試(紅→綠)：同 KB 相同 bytes（不同檔名）→ 回同一 doc id；不同 KB 相同 bytes → 新 doc
- [x] 3.2 ingest 算 `file_hash`（sha256）；text 路徑傳 kind='raw'+fileHash；binary 路徑 createPendingDocument 傳 fileHash；createDocument/createPendingDocument 加 fileHash 參數寫入
- [x] 3.3 去重：ingest 先 `findByFileHash`（同 KB、未 archived）命中即回既有 doc，跳過 S3 + converter
- [x] 3.4 測試(綠)：ingest 3/3 綠

## 4. MCP create（`apps/mcp/src/tools.ts`）

- [x] 4.1 測試(紅→綠)：MCP `create` 產 `.svg` → `kind='asset'`（vaultfs 層另測「asset 不出現在 listing」）
- [x] 4.2 `create()` 對 svg/csv 設 `kind='asset'`
- [x] 4.3 測試(綠)：mcp 9/9 綠

## 5. Contract migration + 收尾

- [x] 5.1 Contract migration `20260701030004_drop_documents_raw_fields.sql`：drop `documents.parser` / `error_message`（先確認無殘留讀取）；套用後 documents 僅剩 kind/file_hash/page_count，document_raw 資料完整
- [x] 5.2 驗證 `sources`(79, parser 39) / `wiki_pages`(21) view 正確
- [x] 5.3 全套測試 92 綠（shared 45 / converter 18 / mcp 17 / api 12）、tsc 全 workspace 綠、ESLint 乾淨
- [x] 5.4 更新 `docs/architecture/workflows.md`（documents 欄位、document_raw、views、角色表）
- [ ] 5.5 依 openspec-commits 分批 commit（`feat(refine-documents-schema): ...`）— 交由使用者委派的 commit agent
