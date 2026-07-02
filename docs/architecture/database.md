---
type: Architecture
title: 資料庫 Schema 與資料流參考
description: 每個資料表的欄位/索引/RLS/trigger 對應、核心設計概念與引用的 module 檔案，以及資料新增/修改流程。
tags: [architecture, database, schema, rls]
timestamp: 2025-07-02T00:00:00Z
---

# 資料庫 Schema 與資料流參考

[← 返回索引](/docs/architecture.md) · [模組地圖](/docs/architecture/module-map.md) · [流程時序圖](/docs/architecture/workflows.md)

本文件是資料庫的**權威參考**：逐表列出 schema、RLS、trigger，說明關鍵設計概念，
並標明每張表由哪個 module 檔案讀寫。所有 SQL 以 `supabase/migrations/` 為準；所有應用層
存取一律經 [`packages/shared/src/vaultfs.ts`](/docs/architecture/modules/shared.md) 的
`PostgresVaultFS`，不存在繞過資料層的直接 SQL。

## 資料表總覽

| 表 / 檢視 | 種類 | 用途 | 主要讀寫者 |
|---|---|---|---|
| `users` | base | 使用者主檔（映射 `auth.users`） | Supabase trigger（自動建立） |
| `api_keys` | base | Programmatic 存取金鑰（雜湊儲存） | `apps/api`（api-keys 路由） |
| `knowledge_bases` | base | 知識庫（每使用者多個） | `vaultfs.ts`（KB 方法） |
| `documents` | base | **核心**：raw 來源 / wiki 頁 / asset 三合一 | `vaultfs.ts`（文件 CRUD） |
| `document_raw` | base（CTI 子表） | raw 專屬處理紀錄（parser / error） | `vaultfs.ts`（ingest 路徑） |
| `document_pages` | base | 分頁來源的逐頁內容（PDF/Office） | `vaultfs.ts`（`finalizeExtractedDocument`） |
| `document_chunks` | base | 分塊全文索引單位（PGroonga） | `vaultfs.ts` + `chunker.ts` |
| `document_references` | base | 引用圖譜邊（cites / links_to） | `vaultfs.ts` + `references.ts` |
| `sources` | view | `kind='raw'` 的可讀投影 | 瀏覽 / ad-hoc 查詢 |
| `wiki_pages` | view | `kind='wiki'` 的可讀投影 | 瀏覽 / ad-hoc 查詢 |

> 依賴方向：所有 `documents` 子表（`document_raw` / `document_pages` / `document_chunks` /
> `document_references`）都 `ON DELETE CASCADE` 掛在 `documents` 或 `knowledge_bases` 下；
> 刪 KB → 級聯清空該 KB 的全部文件與衍生資料。

---

## 逐表 Schema

### `users`

`auth.users` 的鏡射投影，由 Supabase Auth 觸發自動建立，應用層**不主動 INSERT**。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | = `auth.users.id` |
| `email` | TEXT UNIQUE | |
| `display_name` | TEXT | 取自 `raw_user_meta_data.display_name / full_name` |
| `onboarded` | BOOLEAN | 預設 false |
| `page_limit` | INTEGER | 預設 500（配額） |
| `storage_limit_bytes` | BIGINT | 預設 1 GiB（配額） |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at` 由 `set_updated_at` trigger 維護 |

- **Trigger**：`auth.users` INSERT → `handle_new_user()`（SECURITY DEFINER）自動建立此列。
- **RLS**：`SELECT`/`UPDATE` 限 `id = auth.uid()`。

### `api_keys`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK→users | CASCADE |
| `name` | TEXT | 使用者自訂標籤 |
| `key_hash` | TEXT UNIQUE | 金鑰雜湊（原文只在建立當下回傳一次） |
| `key_prefix` | TEXT | `tkms_…` 前綴，供列表辨識 |
| `last_used_at` / `revoked_at` | TIMESTAMPTZ | |

- **RLS**：`SELECT` 限 `user_id = auth.uid()`。金鑰驗證走 service-role 查 `key_hash`
  （`apps/api` 的 `resolveUser()`，見 [api-server.md](/docs/architecture/modules/api-server.md)）。

### `knowledge_bases`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK→users | CASCADE |
| `name` / `slug` | TEXT | `UNIQUE(user_id, slug)`、`UNIQUE(user_id, name)` |
| `description` | TEXT | |

- **Trigger**：INSERT 前 `set_knowledge_base_slug()` → 空 slug 時以 `generate_slug()`
  產生去重 slug（同使用者內唯一）。
- **RLS**：`SELECT` 限 `user_id = auth.uid()`；rename/delete 走 service-role
  （見[設計概念 §RLS 雙軌](#rls-雙軌scoped-vs-service)）。

### `documents` — 系統核心

單一表同時裝三種東西，由 `kind` 分類。**很多欄位只對其中一種有意義**，另一種留 NULL/預設。

| 欄位 | 型別 | 適用 kind | 說明 |
|---|---|---|---|
| `id` | UUID PK | 全部 | |
| `knowledge_base_id` | UUID FK | 全部 | CASCADE |
| `user_id` | UUID FK→users | 全部 | RLS 依據 |
| `kind` | TEXT `raw`/`wiki`/`asset` | 全部 | 分類；預設 `raw`，`documents_kind_check` 約束 |
| `filename` / `title` / `path` | TEXT | 全部 | `path` 預設 `/`；`/wiki/` 開頭 = wiki 頁 |
| `file_type` | TEXT | 全部 | 副檔名 / MIME |
| `status` | ENUM | 全部 | `pending`→`processing`→`ready`/`failed`/`archived` |
| `content` | TEXT | wiki=markdown / raw=彙整文字 | PGroonga 索引 |
| `page_count` | INTEGER ≤300 | raw（分頁來源） | 熱路徑留在 base |
| `tags` | TEXT[] | wiki | **frontmatter 衍生投影**（GIN 索引） |
| `date` | TEXT | wiki | **frontmatter 衍生投影** |
| `metadata` | JSONB | 全部 | 雜項 |
| `file_size` | BIGINT | raw | ingest 時填 |
| `file_hash` | TEXT | raw | 原始 bytes SHA-256，**同 KB 上傳去重** |
| `document_number` | INTEGER | 全部 | 每 KB 遞增（trigger + advisory lock） |
| `stale_since` | TIMESTAMPTZ | wiki | 引用來源被編輯時標記過期 |
| `version` | INTEGER | 全部 | 樂觀版本號 |
| `archived` | BOOLEAN | 全部 | 軟刪；唯一索引只約束未歸檔列 |

- **索引**：`(kb_id, path)`、`(kb_id, status) WHERE NOT archived`、`tags` GIN、`date`、
  `kind`、`(kb_id, file_hash) WHERE file_hash IS NOT NULL`、`content` PGroonga；
  **`UNIQUE(kb_id, path, filename) WHERE NOT archived`**（`idx_documents_unique_active`，
  支撐「建立 vs 覆蓋」語意，歸檔重複不擋新建）。
- **Trigger**：INSERT 前 `set_document_number()`（`pg_advisory_xact_lock` 序號不重複）；
  UPDATE 前 `set_updated_at()`；INSERT/UPDATE/DELETE 後 `notify_document_change()`
  → `pg_notify('document_changes', …)`。
- **RLS**：`SELECT` 限 `user_id = auth.uid()`；**寫入無 RLS policy**，故所有 INSERT/UPDATE/
  DELETE 走 service-role（見設計概念）。

### `document_raw` — CTI 子表

raw 專屬處理欄位，從 base 表拆出（expand-contract 遷移）。1:1 掛在 raw 文件下；wiki/asset 無此列。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `document_id` | UUID PK→documents | CASCADE |
| `parser` | TEXT | `text`（純文字）/ `opendataloader`（PDF/Office）/ `ocr`（圖片有 OCR 文字）/ `none`（圖片無 OCR） |
| `error_message` | TEXT | 解析失敗訊息 |

- **授權**：`grant … to service_role` + RLS enabled（依 supabase-migrations 規範）。

### `document_pages`

分頁來源（PDF/Office）的逐頁內容。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `document_id` | UUID FK | CASCADE，`UNIQUE(document_id, page)` |
| `page` | INTEGER | 1-based |
| `content` | TEXT ≤500k | 該頁 markdown（內嵌圖連結已改寫為 `asset:<assetDocId>`） |
| `elements` | JSONB | 該頁抽出的圖清單 `{"images":[{id, src, filename}]}`（`src=asset:<docId>`）；無圖則 NULL |

- **RLS**：`SELECT` 透過 EXISTS 子查詢間接限定（`documents.user_id = auth.uid()`）。

### `document_chunks` — 全文檢索單位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `document_id` / `user_id` / `knowledge_base_id` | UUID FK | 皆 CASCADE（KB/doc） |
| `chunk_index` | INTEGER | `UNIQUE(document_id, chunk_index)` |
| `content` | TEXT ≤10000 | PGroonga 索引（`&@~` 算子） |
| `page` / `start_char` / `token_count` / `header_breadcrumb` | | 出處與階層追蹤 |

- 由 [`chunker.ts`](/docs/architecture/modules/shared.md) 產生（512-token chunk、128 overlap、
  <32 token 丟棄）。**RLS**：`SELECT` 限 `user_id = auth.uid()`。

### `document_references` — 引用圖譜邊

| 欄位 | 型別 | 說明 |
|---|---|---|
| `source_document_id` / `target_document_id` | UUID FK | 皆 CASCADE |
| `knowledge_base_id` | UUID FK | CASCADE，RLS 依據 |
| `reference_type` | TEXT | `cites`（footnote 引註）/ `links_to`（wiki link） |
| `page` | INTEGER | 引用的來源頁碼 |
| — | — | `UNIQUE(source, target, reference_type)` |

- **RLS**：`SELECT` + `ALL`（讀寫）皆限「KB 屬於 `auth.uid()`」——是**唯一開放已認證使用者
  直接寫入的表**，讓引用圖譜重建走 RLS 而非 service-role。

### `sources` / `wiki_pages`（VIEW）

只投影對應 kind 的相關欄位、過濾 `archived`，供瀏覽 / ad-hoc 查詢。**應用資料層仍讀 base 表**。

---

## 核心設計概念

### ① 單一 `documents` 表裝三種東西（`kind`）

`raw`（上傳來源）/ `wiki`（Claude 撰寫的頁）/ `asset`（內嵌素材，如 PDF 抽出的圖）。
這是 VaultFS「所有東西都是 document」的抽象；`kind` 取代了舊的 `metadata->>'asset'` flag。

**asset 文件細節**（PDF 內嵌圖，`vaultfs.persistPageImages`）：每張圖 → 一筆
`kind='asset'` 文件，`path='/.assets/'`、`metadata={hidden, parent_document_id, kind:'pdf_image'}`、
bytes 存 Storage（key `{user}/{assetDocId}/source.{fmt}`），並以 `file_hash`（SHA-256）
**per-asset 去重**（同圖多頁 / 重新 ingest 不重存）。OCR 文字併入 parent 頁的 `content` → chunks
供搜尋；圖連結在 parent 的 `document_pages.content` / `.elements` 以 `asset:<docId>` 穩定引用。
直接上傳的圖片則是一般 `raw` 文件（非 asset），`document_raw.parser` 記 `ocr`/`none`。

### ② Frontmatter 是真相來源，欄位是衍生投影

對 wiki 頁，**`content`（含 YAML frontmatter 的 markdown）才是唯一真相**；`tags`、`date`
是從 frontmatter 抽出的 denormalized copy，只為讓 SQL 能直接查詢/排序。資料流是
**frontmatter → 欄位**，不是反過來。實作見 [`apps/mcp/src/wiki.ts`](/docs/architecture/modules/mcp-server.md)
（`parseFrontmatter` / `extractDateAndMeta` / `effectiveTags`）→ `vaultfs.ts` 寫欄位。
完整說明與 YAML timestamp 踩雷見 [workflows.md](/docs/architecture/workflows.md)。

### ③ CTI 子表 + expand-contract 遷移

raw 專屬的 `parser`/`error_message` 從 base 表搬到 `document_raw`（1:1），走 expand-contract：
先建子表並回填 → 應用層改讀寫子表 → 最後 drop base 欄位。過程中線上服務不中斷。

### ④ RLS 雙軌（scoped vs service）

見 [`packages/shared/src/db.ts`](/docs/architecture/modules/shared.md)：

- **`scoped*`**（`scopedQuery`/`scopedExecute`）：每次呼叫是一個交易，
  `SET LOCAL ROLE authenticated` + 注入 `request.jwt.claims`，RLS 生效、交易結束自動重置。
  用於**有 SELECT policy 的表**（KB 讀取、chunks 搜尋、references 讀寫）。
- **`service*`**（`serviceExecute` 等）：service-role 直連、繞過 RLS。用於**沒有寫入 policy 的
  操作**：`documents` 的所有寫入、pending 建立、chunk 索引寫入、staleness 傳播、job 復原、
  KB rename/delete。每處都以 `AND user_id = $userId` 在 SQL 層自行圈範圍。

### ⑤ 去重與序號

- `file_hash`（原始 bytes SHA-256）+ `(kb_id, file_hash)` 索引 → 同 KB 上傳去重
  （`vaultfs.findByFileHash`）。
- `document_number` 每 KB 遞增，`set_document_number()` 用 `pg_advisory_xact_lock` 防併發跳號。

### ⑥ 即時通知（不用 Supabase Realtime）

`documents` 任何寫入 → `notify_document_change()` 發 `pg_notify('document_changes', …)`；
[`apps/api/src/notify.ts`](/docs/architecture/modules/api-server.md) `LISTEN` 後 relay 給前端 WebSocket。

---

## 資料流：新增與修改

所有寫入都經 `PostgresVaultFS` 方法 → 對應 SQL。時序圖見
[workflows.md](/docs/architecture/workflows.md)；下表是「哪個方法動哪些表」的速查。

### 上傳來源檔（raw）

| 步驟 | VaultFS 方法 | 動到的表 | 軌道 |
|---|---|---|---|
| 純文字/md：直接建立 | `createDocument()` | `documents`(+`document_raw`) | scoped |
| 二進位：先建 pending | `createPendingDocument()` | `documents`+`document_raw`（CTE 一次插入） | service |
| converter 回傳後定稿（PDF/Office） | `finalizeExtractedDocument()` → `persistPageImages()` | `document_pages`(逐頁 content+`elements`)、每張內嵌圖建 asset `documents`+`document_raw`、`documents`(content/page_count/status=ready、parser=opendataloader) | service |
| 直接上傳圖片定稿 | `finalizeImageDocument()` | `documents`(status=ready、OCR 文字入 content)、`document_raw`(parser=`ocr`/`none`) | service |
| 分塊索引 | （`chunker` 產出後）內部寫入 | `document_chunks`（先 DELETE 再批次 INSERT） | — |

進入點：[`apps/api/src/ingest.ts`](/docs/architecture/modules/api-server.md) 依 `fileType` 分文字 /
圖片 / 二進位三支（圖片跳過 converter、直接 OCR）；二進位由
[`jobs.ts`](/docs/architecture/modules/api-server.md) 的解析佇列呼叫 converter。OCR 由
[`ocr.ts`](/docs/architecture/modules/api-server.md) 的 `OcrProvider`（Mistral/Gemini，可選）於 ingest 層執行。

### Claude 撰寫 / 編輯 wiki 頁

| 步驟 | VaultFS 方法 | 動到的表 | 軌道 |
|---|---|---|---|
| 建立/覆寫 | `createDocument()` / `updateDocument()` | `documents`（frontmatter 抽出 tags/date 寫欄位） | scoped/service |
| 重新分塊 | 內部 | `document_chunks`（DELETE + INSERT） | — |
| 重建引用圖譜 | `deleteReferences()` + `upsertReference()` | `document_references` | scoped |
| 過期傳播 | `propagateStaleness()` | `documents`(stale_since) | service |

引用解析演算法在 [`packages/shared/src/references.ts`](/docs/architecture/modules/shared.md)
（`extractReferences` / `buildLookupMaps`），由
[`apps/mcp/src/references-sync.ts`](/docs/architecture/modules/mcp-server.md) 於每次寫入後觸發。

### 其他變更

| 操作 | VaultFS 方法 | 表 / 語意 | 軌道 |
|---|---|---|---|
| 移動 | `moveDocument()` | `documents.path` | service |
| 更名 | `renameDocument()` | `documents.title` | service |
| 軟刪 | `archiveDocuments()` | `documents.archived=true`（不實刪，釋放唯一索引） | service |
| 建 note/資料夾 | `createNote()` | `documents` | scoped |
| KB 更名/刪除 | `renameKnowledgeBase()` / `deleteKnowledgeBase()` | `knowledge_bases`（刪除級聯全 KB 資料） | service |

---

## 相關規範

- Schema 變更切入點：見 [dev-guide.md](/docs/architecture/dev-guide.md)。
