# 🏗️ Team KMS Architecture

Node.js port of [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki),
Postgres/Supabase-only, no Chrome extension. **The intelligence lives in Claude**:
the backend only ingests, parses, indexes, and serves; Claude reads sources and
writes the wiki through MCP tools. Backend makes **zero LLM calls**.

> The earlier `docs/team-kms-roadmap.md` and `docs/team-kms-tech-architecture.md`
> are **superseded** by this port (they assumed a backend LLM "compiler"). This
> document set is the source of truth.

## Topology — 3 clients → 2 services → 1 storage

```
Claude  ──MCP (HTTP, Supabase JWT)──►  apps/mcp   ┐
Web     ──REST (Supabase JWT)───────►  apps/api   ├─► packages/shared (VaultFS) ─► Postgres + S3
                                       converter ─┘        (RLS · PGroonga FTS)
```

## 完整技術文件（拆分為多檔，見 `docs/architecture/`）

| 文件 | 內容 |
|---|---|
| [`architecture/overview.md`](architecture/overview.md) | 系統總覽、全域 Mermaid 架構圖、技術棧盤點 |
| [`architecture/module-map.md`](architecture/module-map.md) | 邏輯模組拆解與目錄映射 |
| [`architecture/modules/shared.md`](architecture/modules/shared.md) | `packages/shared` 深度解析（DB/RLS、auth、S3、chunker、references、VaultFS） |
| [`architecture/modules/mcp-server.md`](architecture/modules/mcp-server.md) | `apps/mcp` 深度解析（10 個 MCP 工具、guide prompt） |
| [`architecture/modules/api-server.md`](architecture/modules/api-server.md) | `apps/api` 深度解析（REST 路由、TUS 上傳、解析佇列、WebSocket） |
| [`architecture/modules/converter.md`](architecture/modules/converter.md) | `apps/converter` 深度解析（opendataloader、LibreOffice、SSRF） |
| [`architecture/modules/web.md`](architecture/modules/web.md) | `apps/web` 深度解析（路由、元件、認證、上傳、圖譜視覺化） |
| [`architecture/workflows.md`](architecture/workflows.md) | DB schema 摘要、`documents` 表設計概念（frontmatter 為真相來源、衍生欄位）、兩大核心流程時序圖（上傳解析索引 / MCP 搜尋讀取撰寫） |
| [`architecture/dev-guide.md`](architecture/dev-guide.md) | 擴展性與維護指南（新增解析器/MCP 工具/API 路由/前端頁面/migration 的切入點） |

## 一句話摘要

- **Ingest**（`apps/api` → `apps/converter`）：upload → S3 → converter（PDF/Office） →
  chunk → index。文字/markdown 直接索引，Postgres 是唯一真相來源，S3 只存二進位資產。
- **Synthesis**（Claude via MCP）：`search`/`read` 來源 → `create`/`edit`/`append` wiki 頁，
  每次寫入自動解析 citation/wiki link 更新 `document_references` 圖譜。
- **Dependency rule**：`apps/*` 依賴 `packages/shared`，絕不反向；DB 存取全經
  `scoped*`（RLS 隔離）或 `service*`（信任的系統操作）。
- **Stack 速覽**：Node 22 + Hono + `@modelcontextprotocol/sdk` + PostgreSQL/PGroonga +
  Supabase Auth + S3-compatible storage + opendataloader/LibreOffice + Next.js 14。
  完整清單見 [`architecture/overview.md`](architecture/overview.md)。
