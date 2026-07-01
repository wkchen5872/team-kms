# 模組解析：packages/shared

[← 返回索引](../../architecture.md) · [模組地圖](../module-map.md)

## 職責

`packages/shared/src/` 是 `apps/mcp` 與 `apps/api` 共用的基礎設施層：設定、資料庫存取
（含 RLS）、JWT 驗證、S3 客戶端、文字分塊演算法、citation/wikilink 圖譜解析，以及最核心的
`PostgresVaultFS` 資料存取物件。**依賴方向為單向**：`apps/*` 依賴這裡，這裡不依賴任何 app。

## 核心檔案

### `config.ts`
- 以 `zod` 定義 `Config` schema：`DATABASE_URL`、`SUPABASE_URL` 為必填；AWS/converter/
  app URL/port 等為選填。
- 使用 Node 22 原生 `process.loadEnvFile()` 載入 `.env`。
- 入口函式：`loadConfig()` / `loadConfigFromEnvFile(path)`。

### `db.ts` — 雙軌 RLS 資料庫存取模型
- **`scopedQuery<T>()` / `scopedQueryRow<T>() / scopedExecute()`**：使用者範圍查詢。
  每次呼叫是一個交易：`BEGIN` → `SET LOCAL ROLE authenticated` → `set_config('request.jwt.claims', ...)`
  → 執行 SQL → `COMMIT`。`SET LOCAL` 的效力在交易結束時自動重置，避免連線池中的
  角色/claims 洩漏到下一次借用。
- **`serviceQuery<T>() / serviceQueryRow<T>() / serviceExecute()`**：service-role 直連，
  繞過 RLS，僅供系統內部操作使用（pending 文件建立、chunk 索引寫入、job 復原、
  NOTIFY relay）。
- **`listen(channel, onPayload)`**：獨立一條連線做 Postgres `LISTEN`，回傳 stop function。
- 連線池設定：`min=1, max=5, statement_timeout=15s`。

### `auth.ts` — Supabase JWT 驗證
- 使用 `jose` 的 `createRemoteJWKSet` 抓取並快取 `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`。
- **`verifyToken(token)`**：驗證 issuer、`audience='authenticated'`、演算法限定
  `ES256`/`RS256`，回傳 `VerifiedUser { userId, claims }`。
- **`getCurrentUser(authHeader)`**：解析 `Authorization: Bearer` 標頭後呼叫 `verifyToken`。
- **`unsafeDecode(token)`**：僅供 log 用途，不做簽章驗證。

### `s3.ts`
- `S3Service` class（基於 AWS SDK v3），支援 path-style（相容 Supabase Storage / MinIO）。
- 方法：`uploadBytes` / `uploadFile` / `downloadBytes` / `downloadToFile` / `downloadJson` /
  `generatePresignedGet` / `generatePresignedPut` / `deletePrefix` / `ensureBucket`。
- `s3FromConfig()`：由 `Config` 建構 `S3Service` 的 factory。

### `chunker.ts` — 文字分塊
- 常數：`CHUNK_SIZE=512` token、`CHUNK_OVERLAP=128` token、`MIN_CHUNK_TOKENS=32`
  （低於此門檻的 chunk 會被丟棄——測試素材過短會導致 chunk 被靜默忽略，是常見坑）。
- `estimateTokens(text)`：以 `text.length / 4` 粗估 token 數。
- `chunkText(text)` / `chunkPages(pages)`：回傳 `Chunk[]`，每個 chunk 帶
  `headerBreadcrumb`（追蹤 markdown 標題階層）、`page`、`startChar`、`tokenCount`。
- 單一 chunk 上限 10,000 字元（對應 DB 欄位限制）。

### `references.ts` — 引用圖譜解析
- `parseCitationFilename(raw)`：從 footnote（如 `[^N]: paper.pdf, p.3`）解析出檔名與頁碼。
- `parseWikiLinks(content, currentDir)`：解析內部連結（支援 `/wiki/`、`./`、`../`、相對路徑）。
- `buildLookupMaps(docs)`：建立 `{ filenameToDoc, baseToDoc, wikiPathToDoc }` 三種索引，
  加速引用解析比對。
- `extractReferences(content, docId, wikiDir, maps)`：回傳 `RefEdge[]`（`type: cites|links_to`、
  `targetId`、`page`）。

### `vaultfs.ts` — `PostgresVaultFS`（核心資料存取層）
以使用者 `userId` 範圍建構的物件，方法依用途分類：

| 分類 | 方法 |
|---|---|
| 知識庫 | `resolveKb(slug)`、`listKnowledgeBases()`、`createKnowledgeBase()` |
| 文件 CRUD | `getDocument()`、`getDocumentById()`、`createDocument()`、`updateDocument()`、`createPendingDocument()`、`finalizeExtractedDocument()`、`listDocuments()`、`listDocumentsWithContent()`、`archiveDocuments()` |
| 分頁來源 | `getPages()`、`getAllPages()`（PDF/Office 等分頁來源的分段讀取） |
| 全文搜尋 | `searchChunks(kbId, query, limit, pathFilter)`——PGroonga 全文索引查詢，見 [workflows.md](../workflows.md) |
| 引用圖譜 | `deleteReferences()`、`upsertReference()`、`getBacklinks()`、`getForwardReferences()`、`findUncitedSources()`、`findStalePages()`、`propagateStaleness()`、`listReferences()` |
| S3 資產載入 | `loadSourceBytes()`、`loadImageBytes()`、`loadAssetBytes()` |

## 依賴關係

- 依賴外部套件：`pg`（連線池）、`jose`（JWT）、`@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner`、`zod`。
- 不依賴任何 `apps/*`；被 `apps/mcp` 與 `apps/api` 共同引用。
- 資料庫依賴 PGroonga extension（全文索引算子 `&@~`）。
