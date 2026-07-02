---
type: Architecture
title: 系統總覽與全域架構
description: Team KMS 全域架構圖、資料流摘要、核心技術棧與部署拓樸。
tags: [architecture, overview, mcp]
timestamp: 2025-07-02T00:00:00Z
---

# 系統總覽與全域架構

[← 返回索引](/docs/architecture.md)

## 一句話總結

Team KMS 是一個 **Claude-via-MCP 知識庫 wiki 系統**：後端（`apps/api` / `apps/mcp` /
`apps/converter`）只負責上傳、解析、索引與服務資料，**零 LLM 呼叫**；所有「智慧」——
理解來源、撰寫/編輯 wiki 頁面、建立引註與交叉連結——都由 Claude 透過 MCP 工具直接操作。

## 全域技術架構圖

```mermaid
graph TD
    subgraph Clients["客戶端"]
        Claude["Claude<br/>(MCP client)"]
        Web["Web 瀏覽器<br/>(Next.js 14)"]
    end

    subgraph Backend["後端服務 (Hono, Node.js 22)"]
        MCP["apps/mcp<br/>MCP Server<br/>(stateless HTTP)"]
        API["apps/api<br/>REST + WebSocket"]
        Converter["apps/converter<br/>文件轉換服務"]
    end

    subgraph Shared["packages/shared"]
        VaultFS["PostgresVaultFS<br/>(RLS-scoped 資料存取層)"]
        Auth["auth.ts<br/>(Supabase JWT 驗證)"]
        Chunker["chunker.ts<br/>(文字分塊)"]
        References["references.ts<br/>(citation/wikilink 解析)"]
    end

    subgraph Storage["儲存層"]
        PG[("PostgreSQL<br/>+ PGroonga 全文索引<br/>+ RLS")]
        S3[("S3-compatible<br/>(Supabase Storage)")]
    end

    SupaAuth["Supabase Auth<br/>(JWKS / ES256)"]

    Claude -- "MCP (HTTP, Bearer JWT)" --> MCP
    Web -- "REST (Bearer JWT)" --> API
    Web -- "WebSocket (即時通知)" --> API

    MCP --> VaultFS
    API --> VaultFS
    API -- "POST /extract (Bearer)" --> Converter

    VaultFS --> PG
    VaultFS --> S3
    Converter -- "下載來源檔案" --> S3

    MCP -.-> Auth
    API -.-> Auth
    Auth -- "JWKS 驗證" --> SupaAuth

    PG -- "LISTEN/NOTIFY<br/>document_changes" --> API
    API -- "WebSocket relay" --> Web

    VaultFS -.-> Chunker
    VaultFS -.-> References
```

## 資料流摘要

- **上傳/解析（Ingest）**：Web 上傳檔案 → `apps/api` → S3 → （PDF/Office）`apps/converter`
  轉出 per-page markdown → `apps/api` 分塊（chunker）→ 寫入 `document_chunks`（PGroonga 索引）。
  純文字/Markdown 檔案略過 converter，直接分塊索引。詳見 [workflows.md](/docs/architecture/workflows.md)。
- **合成（Synthesis）**：Claude 透過 MCP `search`/`read` 查閱來源，再用 `create`/`edit`/`append`
  寫 wiki 頁。每次寫入都會解析內文中的 footnote citation 與 wiki link，更新
  `document_references` 圖譜邊，並回報「哪些頁面引用了剛編輯的這頁」。**後端全程零 LLM 呼叫**。
- **即時同步**：Postgres trigger 在 `documents` 表 INSERT/UPDATE/DELETE 時發出
  `NOTIFY document_changes`；`apps/api` 監聽後透過 WebSocket 推送給前端。

## 核心技術棧

| 分類 | 技術 | 說明 |
|---|---|---|
| Runtime | Node.js ≥ 22 (ESM, TypeScript 5.7) | 全 Node 實作，含 converter |
| Monorepo | pnpm workspaces | `packages/shared` + `apps/{mcp,api,converter,web}` |
| 後端框架 | Hono v4.6.14 | 可攜至 Cloudflare Workers |
| MCP 框架 | `@modelcontextprotocol/sdk` v1.29.0 | Web-standard Streamable HTTP transport（stateless） |
| 資料庫 | PostgreSQL + PGroonga 全文索引 | Supabase 託管；`&@~` 全文檢索算子 |
| 認證 | Supabase Auth（ES256 JWT）+ `jose` JWKS 驗證 | RLS 依 `request.jwt.claims` 隔離每位使用者 |
| 物件儲存 | S3-compatible（Supabase Storage）+ `@aws-sdk/client-s3` | 存放原始上傳檔案（PDF/Office 來源） |
| 文件轉換 | `@opendataloader/pdf`（Java CLI 包裝）+ LibreOffice（Office→PDF） | 與 Python 原版同一轉換引擎，零品質損失 |
| 上傳協議 | TUS 1.0（`apps/api/tus.ts`，最大 200MB） | 續傳式上傳，simple multipart 為輔 |
| 前端框架 | Next.js 14（App Router）+ React 18 | Client components，Supabase Auth |
| 前端資料視覺化 | `react-markdown` 9 + `mermaid` 11 + `react-force-graph-2d` 1.25 | Wiki 內容渲染 + 知識圖譜 |
| 測試 | Vitest 2.1.8 | 對本機 Supabase stack 跑整合測試 |

## 部署拓樸

- 根目錄 `Dockerfile`：Node 22-slim，建置 `api` / `mcp` / `web`。
- `apps/converter/Dockerfile`：額外安裝 JRE headless + LibreOffice（writer/impress/calc）。
- `docker-compose.yml`：`converter`(8002) ← `api`(8000) ← `mcp`(8001) / `web`(3000)；
  不內嵌 Postgres，資料庫/Auth/Storage 全由 Supabase 提供。
