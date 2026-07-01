# 模組解析：apps/api

[← 返回索引](../../architecture.md) · [模組地圖](../module-map.md)

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
| GET | `/v1/knowledge-bases/:slug/documents` | 文件列表 |
| GET | `/v1/knowledge-bases/:slug/graph` | 知識圖譜（nodes + edges） |
| GET | `/v1/documents/:id/content` | 文件內容 |
| GET | `/v1/documents/:id/source-url` | 原始檔案 presigned S3 URL |
| POST | `/v1/knowledge-bases/:slug/upload` | Multipart 單檔上傳（同步 ingest） |
| POST / HEAD / GET / PATCH | `/v1/files[/:id]` | TUS 1.0 續傳上傳（單檔上限 200MB） |
| WS | `/v1/ws/kb/:kbId?token=<jwt>` | 即時文件變更通知 |

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
- `ConverterClient` 介面：`extract(sourceUrl, ext) → PageContent[]`。
- `HttpConverterClient`：以 Bearer token 呼叫 `apps/converter` 的 `POST /extract`。

### `ingest.ts` — 檔案分流邏輯
```
輸入: { kbId, filename, fileType, bytes, title?, tags?, dirPath? }

若 fileType ∈ {md, txt}:
  → fs.createDocument()（直接寫入，status='ready'）
  → chunkText() → 寫入 document_chunks
  → 回傳 { id, filename, path }

否則（PDF/Office 等二進位）:
  → fs.createPendingDocument()（status='pending'）
  → 上傳至 S3：key = `${userId}/${docId}/source.${fileType}`
  → 呼叫 converter.extract(presignedUrl, fileType)
  → fs.finalizeExtractedDocument()
     - 寫入 document_pages（逐頁）
     - 更新 documents.content / page_count / status='ready'
     - chunkPages() → 寫入 document_chunks
  → 回傳 { id, filename, path }
```

## 依賴關係

- 依賴 `packages/shared`：`PostgresVaultFS`、`auth.ts`、`chunker.ts`、`db.ts`（listen）。
- 依賴 `apps/converter`（HTTP，經 `converter-client.ts`）。
- 依賴 Postgres 的 LISTEN/NOTIFY 機制（migration 003 的 trigger）。
- 不直接依賴 `apps/mcp`（兩者透過共用的 `packages/shared` 資料層保持一致，互不呼叫）。
