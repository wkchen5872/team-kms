---
type: Architecture
title: 模組解析：apps/api
description: apps/api 的職責、核心檔案、REST/WebSocket 路由總表與依賴關係。
tags: [architecture, module, api]
timestamp: 2025-07-02T00:00:00Z
---

# 模組解析：apps/api

[← 返回索引](/docs/architecture.md) · [模組地圖](/docs/architecture/module-map.md)

## 職責

`apps/api` 是 Web 前端的資料介面：知識庫/文件/圖譜的 REST CRUD、檔案上傳（含 TUS 1.0
續傳協議）、非同步文件解析佇列（呼叫 `apps/converter`）、透過 Postgres `LISTEN/NOTIFY`
做即時 WebSocket 推播，以及 API key 管理。與 `apps/mcp` 一樣，**不呼叫任何 LLM**。

## 核心檔案

### `index.ts` — 主應用程式
- **Auth middleware**（套用於 `/v1/*`）：取出 Bearer token → `resolveUser()`：
  - 若 token 以 `tkms_` 開頭 → 視為 API key，雜湊後查 `api_keys` 表（service-role 查詢）。
  - 否則 → 視為 Supabase JWT，走 `verifyToken()`（`packages/shared/auth.ts`）。
  - 成功後在 context 設定 `userId` 與 `fs = new PostgresVaultFS(userId)`，後續所有
    `fs.*` 呼叫皆為 user-scoped（RLS 生效）。
- CORS：允許 `localhost:3000`，`exposeHeaders` 含 `Location`/`Upload-Offset`/
  `Upload-Length`/`Tus-Resumable`（TUS 協議所需）。
- **路由總表**：

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET | `/health` | 健康檢查 |
| POST / GET / DELETE | `/v1/api-keys[/:id]` | API key 建立/列表/撤銷 |
| GET | `/v1/me` | 使用者資訊 |
| GET / POST | `/v1/knowledge-bases` | 知識庫列表/建立 |
| PATCH / DELETE | `/v1/knowledge-bases/:slug` | 知識庫更名（UNIQUE→409）/ 刪除（service-role，cascade） |
| GET | `/v1/knowledge-bases/:slug/documents` | 文件列表 |
| GET | `/v1/knowledge-bases/:slug/graph` | 知識圖譜（nodes + edges） |
| GET | `/v1/knowledge-bases/:slug/search?q=&limit=` | 全文內容搜尋（包 `searchChunks`） |
| POST | `/v1/knowledge-bases/:slug/documents/note` | 建 note / 資料夾（`createNote`，回完整 row） |
| GET | `/v1/documents/:id/content` | 文件內容 |
| PATCH | `/v1/documents/:id` | 改內容（`{content}`）/ 移動（`{path}`）/ 更名（`{title}`） |
| DELETE | `/v1/documents/:id` | 軟刪（`archived`）→204 |
| GET | `/v1/documents/:id/source-url` | 原始檔案 presigned S3 URL |
| GET | `/v1/documents/:id/download` | 同上的別名（redirect 到 presigned） |
| POST | `/v1/knowledge-bases/:slug/upload` | Multipart 單檔上傳（同步 ingest） |
| POST / HEAD / GET / PATCH | `/v1/files[/:id]` | TUS 1.0 續傳上傳（單檔上限 200MB） |
| WS | `/v1/ws/kb/:kbId?token=<jwt>` | 即時文件變更通知 |

> 文件的 INSERT/UPDATE/DELETE 走 service-role（`documents` 只有 SELECT RLS 政策）；
> KB 更名/刪除同理走 service-role。

- 啟動時：`startDocumentListener()`（訂閱 `document_changes` NOTIFY 頻道）、
  `setProcessor()`（註冊解析佇列的 processor）、`recoverStuckJobs()`（復原上次崩潰時
  卡在 pending/processing 的文件）。

### `jobs.ts` — 單執行緒解析佇列
- 全域 queue + draining flag，`enqueue(docId)` 加入佇列並非同步觸發 drain。
- `recoverStuckJobs()`：服務啟動時把狀態卡在 `pending`/`processing` 的文件重新排入佇列
  （崩潰復原）；注意此函式可能早於 `apps/converter` 就緒前執行——一般 UI 上傳走同步路徑，
  無此競態；僅重啟後的堆積任務會受影響。
- `extractionProcessor()`：對文件的 S3 來源做 presign → 呼叫 converter `extract()` →
  finalize 文件（寫入分頁與 chunk）。

### `notify.ts` — 即時通知 relay
- 透過 `packages/shared/db.ts` 的 `listen()` 訂閱 `document_changes` channel
  （由 migration 003 的 trigger 觸發，payload 含 `{ event, id, kb_id, user_id }`）。
- `subscribe(userId, callback)`：註冊每位使用者的 WebSocket 監聽器；收到 NOTIFY 後
  relay 給對應使用者的 WebSocket 連線。

### `tus.ts` — TUS 1.0 續傳協議
- Upload 介面：`{ id, offset, length, filename, fileType, userId, data }`（暫存於記憶體，
  上限 200MB）。
- 函式：`createUpload()`、`getUpload()`、`appendChunk()`、`deleteUpload()`、
  `validateSignature()`、`decodeMetadata()`。

### `converter-client.ts`
- `ConverterClient` 介面：`extract(sourceUrl, ext) → PageContent[]`（`PageContent` 含
  `images: {id, dataBase64, format}[]`——PDF 內嵌圖，見 [converter](converter.md)）。
- `HttpConverterClient`：以 Bearer token 呼叫 `apps/converter` 的 `POST /extract`。

### `ocr.ts` — 可插拔圖片 OCR（可選，跑在 ingest 層）
- `OcrProvider` 介面 `ocrImage(bytes, mime) → {text}`，實作 `MistralProvider` / `GeminiProvider`。
- `ocrProviderFromEnv()`：依 `OCR_PROVIDER=mistral|gemini|none` + 對應 API key 選 provider；
  未設則回 `null`（後端維持零 LLM）。
- `ocrImageBytes` / `ocrPageImages`：對圖片跑 OCR，**失敗回 undefined（優雅降級，不阻斷 ingest）**。
- OCR **只在 ingest 層**執行（有 provider key）；converter 永遠不碰 LLM。

### `ingest.ts` — 檔案分流邏輯
兩個進入點:**`ingestSource`（同步）** 供 multipart `POST /upload`；
**`ingestAsync`（非同步）** 供 TUS `/v1/files`——只做 dedup + 建 pending 文件 + 上傳 S3,
然後 `enqueue(docId)` 交給單執行緒 jobs 佇列(一次一份),**上傳立即返回、永不撞 converter 併發上限**,
失敗由佇列標記 `documents.status='failed'`。text 檔(md/txt)兩者都直接寫入 ready。以下為抽取邏輯（兩者共用）:
```
輸入: { kbId, filename, fileType, bytes, ... }，deps 可帶 ocr?: OcrProvider|null

若 fileType ∈ {md, txt}:
  → fs.createDocument()（直接寫入，status='ready'）→ chunkText()

否則若 fileType ∈ {png,jpg,jpeg,webp,gif}（直接上傳的圖片）:
  → fs.createPendingDocument() → 上傳 S3（不經 converter）
  → ocrImageBytes()（可選）→ OCR 文字
  → fs.finalizeImageDocument(docId, kbId, ocrText)（status='ready'，OCR 文字入 content+chunks）

否則（PDF/Office 等二進位）:
  → fs.createPendingDocument()（status='pending'）→ 上傳 S3
  → converter.extract() → pages（含內嵌圖 bytes）
  → ocrPageImages()（可選）→ 每張圖填 ocrText
  → fs.finalizeExtractedDocument()
     - 每張圖存成 asset 文件（Supabase Storage）+ 寫 document_pages.elements
       + 改寫 markdown 圖連結 `odl-image:<id>` → `asset:<assetDocId>`
     - 更新 documents.content / page_count / status='ready'，chunkPages() 入索引
```

## 依賴關係

- 依賴 `packages/shared`：`PostgresVaultFS`、`auth.ts`、`chunker.ts`、`db.ts`（listen）。
- 依賴 `apps/converter`（HTTP，經 `converter-client.ts`）。
- 依賴 Postgres 的 LISTEN/NOTIFY 機制（migration 003 的 trigger）。
- 不直接依賴 `apps/mcp`（兩者透過共用的 `packages/shared` 資料層保持一致，互不呼叫）。
