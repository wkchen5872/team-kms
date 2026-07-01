# Tasks — port-llmwiki-nodejs

> 順序依賴：Stage 0（垂直切片）必須先端到端跑通，再進 Stage 1+。
> TDD：標註「(test)」的任務先寫失敗測試再實作（見 `.claude/rules/tdd-enforcement.md`）。

## 1. Stage 0 — Scaffold

- [x] 1.1 建立 pnpm workspaces monorepo：`packages/shared`、`apps/{mcp,api,converter,web}`，TS 設定、eslint/prettier、`.env.example`
- [x] 1.2 建立本機 Supabase CLI 堆疊；採用 migrations 001-004 + 008，PGroonga 已裝、7 表就位、`.env` 已產生
- [x] 1.3 確認 host：Java 25 ✓；LibreOffice 未裝（僅 Stage 2 Office 需要，task 6.6 再裝）

## 2. Stage 0 — packages/shared（切片子集）

- [x] 2.1 `config`：Node22 `loadEnvFile` + zod 驗證（免 dotenv）；3 測試 + 真實 .env smoke 綠
- [x] 2.2 `db`：pg 連線池 + `scoped*`/`service*`、RLS `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',…)` (test: RLS 跨租戶隔離 3/3 綠，真實 Supabase 驗證)
- [x] 2.3 `auth`：jose `createRemoteJWKSet` + ES256/RS256 驗證（issuer/aud/exp/sub）(test: 真實 ES256 token 過、壞 token/竄改簽章被拒 5/5 綠)
- [x] 2.4 `s3`：`@aws-sdk/client-s3` v3 上傳/下載/presign/deletePrefix（S3-相容 endpoint）(test: presign GET/PUT 離線 2/2)
- [x] 2.5 `chunker`：移植切塊演算法（~512 token、~128 overlap、header breadcrumb）(test: port `test_chunker.py` → 14/14 綠)
- [x] 2.6 `references`：citation + wikilink 解析（純函式 extract/buildLookupMaps）(test: port `test_references*.py` 7/7 綠)
- [x] 2.7 `PostgresVaultFS` 全 27 方法（精簡 schema：無 highlights/source_content）+ migration 009 補 unique active index (test: VaultFS 契約 8/8 綠，真實 Supabase)

## 3. Stage 0 — converter（Node）

- [x] 3.1 Hono `POST /extract`（bearer timing-safe）+ `GET /health` (test: app 4/4)
- [x] 3.2 SSRF：允許設定的 S3 endpoint/bucket + AWS，下載位元組上限 (test: SSRF 5/5、download 串流上限)
- [x] 3.3 PDF 抽取：`@opendataloader/pdf`（同 Java CLI）→ JSON (test: **真實 PDF live 抽取** 1/1)
- [x] 3.4 JSON→markdown：移植 `elementToMarkdown` + `assemblePages`（排除 header/footer）(test: markdown 7/7)
- [x] 3.5 office 走 LibreOffice killable subprocess（task 6.6 裝後可用）+ 併發上限拒收 503

## 4. Stage 0 — ingest（最小）

- [x] 4.1 `ingestSource` orchestration + `createPendingDocument`/`finalizeExtractedDocument`；存 S3（Supabase Storage）→ pending doc
- [x] 4.2 `HttpConverterClient`（可注入 fetch）→ presigned URL → converter → 存頁 + chunkPages 索引
- [x] 4.3 純文字（md/txt）直接索引、跳過 converter (test: PDF 端到端 live + text 直接索引 2/2 綠)

## 5. Stage 0 — mcp（最小）+ web（最小）+ 端到端

- [x] 5.1 `@modelcontextprotocol/sdk` hosted HTTP（Hono + WebStandard transport）+ Supabase JWT，stateless per-user (test: 無/壞 token 401、有效 token 完成 initialize handshake 4/4)
- [x] 5.2 工具 `guide`、`list_knowledge_bases`、`create_knowledge_base`
- [x] 5.3 工具 `search`（list/search/references 三模式）、`read`（單檔 + page range + glob batch）
- [x] 5.4 工具 `create`/`edit`/`append`（frontmatter、re-chunk、reference graph）+ `delete`（保護核心頁）(test: 真實 MCP 協定 7/7，含 links_to edge + backlink)
- [x] 5.5 web 最小：Supabase Auth 登入 + KB 清單 + wiki/source 瀏覽（Next.js，`next build` 綠）
- [x] 5.6 **端到端驗證**（自動化等價）：ingest PDF（S3→converter→index）+ MCP 協定 `search`/`read`/`write`→ DB 出現 wiki doc + reference edge + backlink + web build。真人「Claude Code 連線」步驟見 README

## 6. Stage 1+2 — MCP / API 補齊

- [x] 6.1 MCP `search` 三模式 + `delete`（保護核心頁）+ `lint`（frontmatter/dangling/orphan/uncited/stale）(test: lint 報 orphan、delete 保護 overview)。`read` image 載入隨 highlights 一併移除
- [x] 6.4 WebSocket（`/v1/ws/kb/:kbId`）+ Postgres LISTEN/NOTIFY `document_changes` 轉發 (test: INSERT relay 1/1 綠)
- [x] 6.5 核心路由 `me`/`health`/`knowledge-bases`/`documents`/`graph`/`upload` (test: api 3/3 綠)
- [x] 6.2 TUS 1.0 續傳上傳（POST/HEAD/PATCH）+ 檔案簽章驗證 + 200MB 上限 (test: 斷點續傳→ingest、超量 413、錯簽章 415，3/3 綠)
- [x] 6.3 async 抽取 job 佇列（pending→processing→ready|failed）+ 啟動 recover stuck (test: 重啟後 stuck job 重入列並 ready 1/1 綠)
- [x] 6.5b `api_keys` CRUD + API key 認證（hash 儲存）(test: 建鑰→認證→列出→撤銷後失效)。`public` 唯讀分享於 proposal 已明確**移除**（非延後）
- [x] 6.6 converter Office 路徑：LibreOffice(soffice) docx→PDF→opendataloader (test: **真實 LibreOffice live** docx 抽取 1/1 綠)

## 7. Stage 3 — Web 補齊（核心 + graph）

- [x] 7.1 KB 清單、wiki/source 樹狀導覽、文件選取（精簡自建，非整包複製）
- [x] 7.4 GraphViewer（react-force-graph-2d）讀 `/graph` 端點 (verify: `next build` 綠)
- [x] 7.5 無 highlight/extension/sharing/marketing 殘留（greenfield 精簡，build 0 warning）
- [x] 7.2 PdfViewer（瀏覽器原生 `<embed>` 接 `/source-url` presigned）+ WikiContent mermaid 渲染 (verify: `next build` 綠)
- [x] 7.3 NoteEditor（TipTap）— **移除（設計決策）**：編輯由 Claude 經 MCP `create`/`edit`/`append` 負責；web 為唯讀瀏覽（見 design.md，spec 無編輯需求）

## 8. Stage 4 — 重構收尾與文件

- [x] 8.1 無雙模式分支/死碼（greenfield 單一 hosted 路徑；shared 共用層、清楚服務邊界）
- [x] 8.2 重寫 `docs/architecture.md`（以本系統為準）+ 標註舊 `docs/team-kms-*.md` 擱置
- [x] 8.3 docker-compose（converter + mcp + api + web，連 Supabase）+ Dockerfile + README 啟動說明
- [x] 8.4 全測試套件綠燈（76 tests）、type check 全綠、`pnpm -r build` 綠（含 next build）
