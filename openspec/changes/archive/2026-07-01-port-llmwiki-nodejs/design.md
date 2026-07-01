## Context

要移植的 `lucasastorian/llmwiki`（Python）核心形狀是 **3 種 client → 2 個服務 → 1 個儲存抽象**：Claude 經 MCP、Web 經 HTTP API，兩者落到同一個 VaultFS（Postgres + S3）。原作者為了同時支援「本機 SQLite/檔案」與「雲端 Postgres/S3」而到處有雙模式分支（`hosted.py`/`local.py`、`vaultfs/postgres.py`/`sqlite.py`、watcher、local 上傳/檔案路由），是本次要重構掉的主要亂源。

盤點依據：clone 於 scratchpad（api 9.3k / mcp 4.1k / web 15k / converter 319 / sql 407 行）。本設計服務於 proposal 的 6 個 capability spec。

## Goals / Non-Goals

**Goals:**
- 忠實移植 llmwiki 的 Claude-via-MCP 架構（後端零 LLM），維持核心功能。
- 全 Node.js + TypeScript；converter 亦為 Node（呼叫同一 LibreOffice + opendataloader Java 引擎）。
- 只留 Postgres/Supabase 一條儲存路徑，刪除 SQLite/local-fs 與 extension/highlight/sharing。
- 用 monorepo + Hono 把雙模式分支重構成單一 hosted 路徑。
- 先以一條含完整認證的垂直切片證明架構成立。

**Non-Goals:**
- 任何功能新增/修改（移植後另開 change）。
- Cloudflare Worker 實際部署與驗證（Hono 鋪路但不在範圍）。
- Office 進階格式、highlights、KB 分享、course mode、Claude Routines 自動排程（後續）。

## Decisions

### D1. 架構：Claude-via-MCP，後端零 LLM
wiki 內容由 Claude 透過 MCP `write/edit/append` 產生；後端只負責上傳/解析/索引/檢索。
- **為何**：原 repo 即如此；智慧放 Claude 比後端自建 prompt 編排引擎（舊 team-kms roadmap 的做法）省事且正確。
- **取代**：刪掉舊 roadmap 的 Prompt A/B、Daemon-compile、Review Queue 概念，不移植。

### D2. Monorepo（pnpm workspaces）+ `packages/shared`
`apps/mcp` 與 `apps/api` 共用 `packages/shared`（config、db pool+RLS、JWT 驗證、S3、`PostgresVaultFS`、chunker、references/graph、zod types）。
- **為何**：兩服務本就共用 VaultFS 與 services；共用套件避免兩份維護，也是重構雙模式的落點。
- **替代**：兩個獨立 repo（被否決，共用碼會漂移）。

### D3. 後端框架 Hono
- **為何**：Node 與未來 Cloudflare Worker 同一套碼可跑，呼應 tech-arch 的 Worker 野心；輕量、TS 友善。
- **替代**：Express/Fastify（生態大但綁 Node runtime，上不了 Worker）。
- **註**：TUS 續傳、WebSocket、長時 OCR job 本就不適合 Worker，這些功能於 Node 執行；Hono 只是讓無狀態路由保留可攜性。

### D4. converter 全 Node 重寫（零品質損失）
opendataloader 是 **Java CLI 的薄包裝**（PyPI 原文 "A Python wrapper for the opendataloader-pdf Java CLI"，需 Java 11+）；LibreOffice 是系統二進位。Node `child_process` 直接呼叫兩者即可。
- **為何**：抽取品質由外部引擎決定，與宿主語言無關；全 Node 符合單一語言重構目標。
- **取捨**：host 仍需安裝 LibreOffice + JVM（與現況相同），故 converter 仍為獨立容器。

### D5. 資料模型沿用，刪除 highlight/sharing migration
採用 Supabase migrations 001-004（users/api_keys/kb/documents/pages/chunks/references/notify）+ 008（kind）；刪 005（highlights）/006（kb_sharing）/007（annotation 搜尋欄）。PGroonga 全文搜尋與 RLS policy 照搬。
- **為何**：core 資料模型不需改；highlight/sharing 隨 extension 一起移除。

### D6. 認證：Supabase JWT + Postgres RLS，切片即上完整
api/mcp 以 Supabase JWKS 驗 JWT，DB 走 `authenticated` role + `set_config('request.jwt.claims',…)`；系統級操作（job recovery、LISTEN/NOTIFY relay）走 service-role 旁路。
- **為何**：使用者明確要求切片即上完整認證；RLS 是原 repo 多租戶隔離的根基，延後反而要回頭改 VaultFS。

### D7. 建置順序：垂直切片先行
切片 = 上傳一個 PDF/md → S3 → converter → chunk/index → MCP(`search/read/write`) 於 Claude Code 跑通 → web 看到 wiki 頁。其餘（delete/lint、TUS、WS、public、api_keys、Office、graph viz）為後續 Stage。
- **為何**：最早拿到端到端可用系統、最早驗證架構假設。

## Risks / Trade-offs

- **PGroonga 相依** → 部署的 Postgres/Supabase 必須裝 PGroonga 擴充；migration 內 `CREATE EXTENSION` 需具權限。Mitigation：Supabase 內建支援；本機用含 PGroonga 的 Docker image。
- **opendataloader 輸出格式版本差異** → 不同版本 JSON 欄位可能變動。Mitigation：鎖定與原 repo 同版（2.3.0）的 CLI，並以單測比對 Python 版輸出。
- **MCP SDK（Node）與 Python FastMCP 行為差異** → 工具註冊/SSE 細節可能不同。Mitigation：切片階段先打通最小 4 工具，逐一對照行為。
- **RLS `set_config` 與連線池交互** → 在共用連線上忘了 reset claims 會洩漏跨租戶資料。Mitigation：每次 scoped 查詢用 `SET LOCAL`（交易內），沿用原 `db.py` 模式並加測試。
- **「維持原功能」與「精簡」邊界** → 重構時可能誤刪仍被 core 依賴的碼（如 highlight_chunks 與 search 的耦合）。Mitigation：刪除前先追依賴；切片用最小集合驗證再擴張。
- **Office→PDF 需 LibreOffice** → 容器肥大、冷啟慢。Mitigation：Office 留到 Stage 2，切片只吃 PDF/md。

## Migration Plan

1. 建 monorepo 骨架 + `packages/shared` 子集 + Supabase 專案（migrations 001-004,008）。
2. 依垂直切片順序實作（converter → ingest 最小 → mcp 最小 → web 最小），端到端驗證。
3. 逐 Stage 補齊 MCP/API/Web，移植單測（chunker、references）為 Node 測試。
4. 收尾重構與文件；`docs/architecture.md` 以本系統重寫；舊兩份 docs 標註擱置。
- **Rollback**：本變更為新建程式碼，無線上系統可回滾；以 git branch 隔離，未驗證不合 main。

## Open Questions

- 切片用 Supabase 雲端專案還是本機含 PGroonga 的 Postgres Docker？（傾向後者開發更快，兩者皆相容。）
- chunker 參數（token 大小/overlap）是否完全沿用原值，或重訂？（先沿用，之後再調。）
- MCP hosted 給 Claude Code 連線用直接 bearer token；OAuth 同意頁（claude.ai Routines 用）是否納入 Stage 2。
