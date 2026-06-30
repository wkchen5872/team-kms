## Why

`team-kms` 原本的設計（`docs/team-kms-roadmap.md`、`docs/team-kms-tech-architecture.md`）把「智慧」放在後端 Daemon（Prompt B 編譯 / Prompt A 矛盾偵測 / Review Queue），等於在後端自建一套 LLM 編排引擎。要參考的 `lucasastorian/llmwiki` 刻意把智慧推給 Claude：後端只做 **上傳 / 解析 / 索引**，wiki 由 **Claude 透過 MCP write 工具自己寫**。這是更省事、更正確的架構。

本變更先把 llmwiki **移植成 Node.js 並精簡、重構**（原作者 hosted/local 雙模式分支偏亂），維持核心功能，作為後續功能修改的乾淨地基。功能新增/修改不在本變更範圍。

## What Changes

- 採用 **Claude-via-MCP** 架構：後端零 LLM 呼叫；wiki 內容由 Claude 經 MCP `write`/`edit`/`append` 工具產生。
- 全面 **Python → Node.js**（含 converter；已查證 opendataloader 是 Java CLI 的薄包裝，Node 直接呼叫同一 LibreOffice 二進位 + opendataloader Java 引擎，**零抽取品質損失**）。
- **BREAKING**：資料庫只支援 **Postgres / Supabase**，刪除所有 **SQLite + local-filesystem** 模式（watcher / local_processor / sqlite vaultfs / local 上傳與檔案服務 / 本機 stdio MCP）。
- **移除 Chrome extension 全家**：extension 本體、highlights / webclip / html_parser、KB 分享（public sharing）、course mode、行銷與法務頁。對應刪除 Supabase migrations 005 / 006 / 007。
- **Monorepo（pnpm workspaces）+ 後端 Hono**：`packages/shared` 由 `apps/mcp` 與 `apps/api` 共用，重構掉雙模式分支。
- `web/` 既有 Next.js **複製 + 精簡**（非改寫），砍掉 highlights/extension/marketing，保留核心 wiki 瀏覽 + graph 視覺化。
- 建置採 **垂直切片先行**：一條含完整 Supabase Auth + JWT + RLS + hosted MCP 的端到端最瘦線先跑通，再逐層補齊。
- `docs/team-kms-roadmap.md`、`docs/team-kms-tech-architecture.md` 明確擱置，不主導本設計。

## Capabilities

### New Capabilities
- `storage-vaultfs`: Postgres + S3 的儲存抽象（VaultFS）——knowledge base / document / page / chunk / reference 的讀寫，PGroonga 全文搜尋，S3 資產載入。對應 `mcp/vaultfs/postgres.py` + `api/services/hosted.py` 的 Node 版。
- `mcp-server`: hosted MCP（HTTP/SSE + Supabase JWT）暴露給 Claude 的工具：`guide / list / search / read / write / delete / lint`，含 citation + wikilink → reference graph 維護。wiki 由此被寫入。
- `ingest-pipeline`: 上傳 → 存 S3 → 觸發 converter → chunk + index 的攝入流程（含 TUS 續傳、async OCR job、啟動 recover、pg LISTEN/NOTIFY 變更通知）。
- `converter-service`: Node 版文件抽取服務——S3 下載、Office→PDF（LibreOffice 二進位）、PDF→JSON（opendataloader Java CLI）、JSON→markdown。
- `auth-rls`: Supabase Auth（JWT/JWKS 驗證）+ Postgres Row-Level Security（`set_config('request.jwt.claims', …)`）的多租戶隔離，api 與 mcp 共用。
- `web-wiki`: 精簡後的 Next.js 介面——Supabase Auth、KB 清單、wiki/文件瀏覽、PDF/markdown 檢視、graph 視覺化（react-force-graph-2d）。

### Modified Capabilities
<!-- 無：openspec/specs/ 目前為空，全部為新 capability。 -->

## Impact

- **新程式碼**：monorepo（`packages/shared`、`apps/mcp`、`apps/api`、`apps/converter`、`apps/web`）。
- **資料庫**：採用 Supabase migrations 001-004 + 008；刪除 005 / 006 / 007 與 `shared/sqlite_schema.sql`。
- **依賴**：Node（Hono、`@modelcontextprotocol/sdk`、`pg`/`postgres`、`@aws-sdk/client-s3`、`jose`/`jwks-rsa`、`js-yaml`、`zod`）；host 仍需 **LibreOffice + JVM（Java 11+）** 供 converter。
- **刪除**：所有 local-mode 與 extension/highlight/webclip/sharing 程式碼（見 What Changes）。
- **文件**：`docs/team-kms-roadmap.md`、`docs/team-kms-tech-architecture.md` 擱置；移植後 `docs/architecture.md` 以本系統為準重寫。
- **部署**：PoC 本機 + docker-compose（postgres + converter + mcp + api + web）；Cloudflare Worker 由 Hono 鋪路但不在本次驗證。
