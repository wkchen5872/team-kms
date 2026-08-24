# Team KMS

Team KMS 是一個「**Claude 撰寫、團隊瀏覽**」的知識庫 wiki：人員上傳來源檔，Claude 透過 MCP
讀取來源並撰寫可互相連結、可追溯引用的 wiki；網站則提供一般使用者瀏覽內容與圖譜。
它是 [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) 的 Node.js port，採
Postgres/Supabase，不含 Chrome extension。

先讀這份 README 決定要走哪一條路；詳細技術結構見[架構總覽](docs/architecture.md)。

## 先選擇你要做的事

| 你的目標 | 從哪裡開始 | 不要誤解成 |
|---|---|---|
| 在筆電開發、整理 wiki、測 MCP | [本機開發](#本機開發) | production 資料會自動跟著變更 |
| 驗證功能或重現問題 | [測試](#測試) | 只開網站就等於整條上傳／MCP 流程正常 |
| 讓其他人瀏覽既有 wiki | production Web UI | production 已提供 Claude 的 MCP 撰寫入口 |
| 更新 production 的程式或 schema | [部署](docs/deployment.md) | 部署程式會自動搬移本機內容 |

## 目前的運作邊界

> **狀態快照（2026-08-24）**：production 的 Web、API、Converter 與 hosted Supabase 已完成部署；
> 本機內容已作過一次性複製到 hosted Supabase。**production MCP 尚未部署**，目前 production
> 網站的用途是讓其他人瀏覽 wiki，不是提供遠端 Claude 撰寫服務。

| 環境 | 用途 | 資料位置 | MCP 狀態 |
|---|---|---|---|
| 本機 | 開發、測試、以 Claude 整理內容 | local Supabase | `http://localhost:8011/mcp` |
| Production | 對外提供 wiki 網站 | hosted Supabase | 未部署 |

這兩個資料庫是**獨立環境**。`supabase link` 只把此資料夾關聯到某個 remote 專案；`db pull` / `db push`
處理的是 schema migration。它們都不會自動雙向同步內容或 Storage。要搬移既有內容時，必須明確執行
[部署文件的一次性資料搬遷說明](docs/deployment.md#一次性資料搬遷已完成不要當成日常部署)。

## 元件如何合作

```
Claude ── MCP ──► apps/mcp ─┐
Web ──── REST ─► apps/api ─┼─► packages/shared ─► Supabase (Postgres + Storage)
                            └─► apps/converter
```

- `apps/mcp` 是 Claude 的讀寫入口；它不會自行產生內容。
- `apps/api` 供 Web 上傳、讀取檔案與圖譜；`apps/converter` 處理 PDF／Office。
- `packages/shared` 統一處理 RLS、Auth、S3、索引與引用關係；同一個登入者只會看到自己的資料。

## 本機開發

### 前置條件

- Node.js ≥ 22、pnpm、Docker 與 [Supabase CLI](https://supabase.com/docs/guides/cli)
- Java 11+（converter 必要）；要匯入 Office 檔時另需 LibreOffice

### 第一次設定

```bash
pnpm install
cp .env.example .env
supabase start
supabase status -o env
```

將 `supabase status -o env` 顯示的本機 URL／keys 填入根目錄 `.env`；再建立
`apps/web/.env.local`，放入 Web 需要的 `NEXT_PUBLIC_SUPABASE_URL`、
`NEXT_PUBLIC_SUPABASE_ANON_KEY` 與 `NEXT_PUBLIC_API_URL`。兩個檔案都不進版控；完整責任分工見
[環境變數配置](docs/env-configuration.md)。

### 每次開始工作

```bash
supabase start       # 已啟動時可安全重跑
pnpm dev
```

`pnpm dev` 會同時啟動四個本機服務：

| 服務 | 位址 | 用途 |
|---|---|---|
| Web | http://localhost:3010 | 登入、瀏覽、上傳與檢視圖譜 |
| API | http://localhost:8010 | Web 的 REST／WebSocket 後端 |
| MCP | http://localhost:8011/mcp | Claude/Codex 的 wiki 撰寫入口 |
| Converter | http://localhost:8012 | PDF／Office 解析 |

若 Web 登入後看不到預期專案，先確認登入帳號與資料庫環境：RLS 會依帳號隔離資料，本機與
production 也不共用資料。不要以為這是同步失敗後直接覆寫資料庫。

## 測試

```bash
supabase start
pnpm -r test
pnpm typecheck
pnpm lint
```

自動化測試驗證本機 Supabase、RLS、文件解析與 MCP 協定；手動驗證「上傳 → Claude 寫 wiki → Web
看結果」時，依[測試指南](docs/testing.md)逐步進行。

## 使用 MCP 撰寫 wiki

MCP 是**作者工具**，而不是 production Web UI 的必要元件。先啟動本機服務、使用與 Web 相同帳號
取得的 Supabase JWT 或 Team KMS API key，再把 MCP client 指向 `http://localhost:8011/mcp`。
Claude/Codex 應先呼叫 `guide`，再以 `search`、`read`、`create`、`edit`、`append` 整理內容。

完整的 token 取得、Claude/Codex 連線與驗證方式見[測試指南](docs/testing.md#4-接上-mcp讓-claude-寫-wiki)。

## 部署

目前正式路徑是 **Cloud Run（Web → API → Converter）+ hosted Supabase**；它不會部署 MCP。
部署程式、schema migration、一次性內容／Storage 搬遷與驗證順序見[部署指南](docs/deployment.md)。
根目錄 `docker-compose.yml` 是容器拓樸參考，不是目前 production 的部署入口。

## 專案結構

```
packages/shared   VaultFS、RLS DB、Supabase JWT、S3、chunker、references
apps/mcp          Hosted MCP server（Claude/Codex 的讀寫介面）
apps/api          Web REST API（KB、文件、圖譜、上傳）
apps/converter    PDF／Office → markdown
apps/web          Next.js（認證、KB、wiki、圖譜）
supabase/         migrations（Postgres + PGroonga + RLS）
```

## Inspired By

- [Karpathy's LLM Wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — 本專案移植的 Python 原作
