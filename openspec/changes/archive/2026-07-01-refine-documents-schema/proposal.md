## Why

移植 llmwiki 後審視資料庫時發現：`documents` 統一表用 `path` + `metadata->>'asset'` 等 JSONB
flag 拼湊來區分「原始檔 / wiki 稿 / asset」三種文件——這是繼承自 upstream postgres 路徑的髒編碼
（upstream 的 sqlite 路徑其實有乾淨的 `source_kind` 欄位）。結果維護時反覆困惑「某欄為什麼是空的」，
且缺乏文件分類的正式模型與上傳去重機制。本次把最痛、最低風險的三塊處理掉，其餘（metadata 整理、
抽圖/OCR、public 分享）明確擱置到有實例再各自成 change。

## What Changes

- 新增 `documents.kind` 欄位（`raw` / `wiki` / `asset`），復原 upstream `source_kind` 的乾淨分類模型；
  寫入時明確指派（上傳來源→`raw`、`/wiki/` 頁→`wiki`、Claude 產的 svg/csv→`asset`）。
- 以 `kind = 'asset'` **取代** `metadata->>'asset'` 的隱藏濾網（濾網原本有、但從沒被餵值，等於接上）。
- 新增 `document_raw` 子表（class-table inheritance）：把 raw 專屬的處理紀錄欄
  （`parser`、`error_message`，評估 `page_count`）從 `documents` 移出；`file_size` / `status` 留 base。
- 上傳去重：新增 `documents.file_hash`（原始 bytes 的 sha256），ingest 時計算，同一知識庫內
  命中相同 hash 的既有文件即視為重複，不重存 S3、不重跑解析。
- 新增 `sources` / `wiki_pages` 兩個唯讀 VIEW，各只投影該類相關欄位，輔助瀏覽/查詢的可讀性。
- **BREAKING**（內部資料層）：`documents` 移除 `parser` / `error_message`（改由 `document_raw`
  join 取得）；讀取 raw 欄位的查詢需調整。無對外 API 破壞。

明確不在本次範圍：`metadata` JSONB 整理（`description` / `parent_document_id` 提升）、
`document_wiki` 子表、PDF/office 抽圖 + 圖片 OCR、public 唯讀分享（upstream 006，刻意不做）。

## Capabilities

### New Capabilities
- `document-model`: `documents` 的文件分類（`kind`：raw/wiki/asset 的定義、指派規則、asset 隱藏）、
  `document_raw` 子表結構與 base↔子表的讀寫規則、以及 `sources`/`wiki_pages` 瀏覽 view。
- `upload-deduplication`: 上傳來源時以 `file_hash`（原始 bytes sha256）在知識庫範圍內偵測並去除
  重複檔案的行為。

### Modified Capabilities
<!-- openspec/specs/ 目前為空（port change 尚未 archive），無既有 spec 需修改。 -->

## Impact

- **Migrations**（`supabase/migrations/`）：4 支 forward-only 時間戳 migration——
  (1) 加 `kind` + 回填既有 103 筆（path 判定；failed 圖歸 `raw`）+ CHECK/index；
  (2) 加 `file_hash` + index；
  (3) 建 `document_raw` + 搬 `parser`/`error_message`(/`page_count`) + base drop 這幾欄；
  (4) 建 `sources`/`wiki_pages` view。皆附 `grant ... to service_role` + RLS（依專案 migration 規範）。
- **`packages/shared/src/vaultfs.ts`**：`createDocument` / `createPendingDocument` /
  `finalizeExtractedDocument`（寫 `kind` + `document_raw` 雙寫）、`listDocuments` /
  `listDocumentsWithContent`（join `document_raw`、隱藏濾網改 `kind <> 'asset'`）。
- **`apps/api/src/ingest.ts`**：計算 `file_hash` + 去重、設 `kind = 'raw'`、傳 pipeline 欄給 `document_raw`。
- **`apps/mcp/src/tools.ts`**：`create()` 對 svg/csv 設 `kind = 'asset'`。
- **既有資料**：本機 DB 103 筆需回填 `kind` 與建立 `document_raw` 對應列；`file_hash` 僅對新上傳生效。
- 對外 REST / MCP 介面無破壞性變更。
