---
type: Reference
title: Environment Configuration
description: Which env file owns which variables, the local/cloud split, and how to tell what is ready to fill.
tags: [config, env, deployment, conventions]
timestamp: 2026-08-24T00:00:00Z
---

# 環境變數配置

`.env.example`（committed）是**機器可讀的權威來源** —— 每個變數都標了所屬檔案、
local/cloud scope 與 readiness。本文件是它的**人類版說明**:解釋為什麼這樣切、
以及常見的困惑點。

## 檔案地圖 — 誰擁有什麼

| 檔案 | 內容 | 誰讀 | 版控 |
|---|---|---|---|
| `.env` | A（CLI/部署憑證）+ B-local（後端本機 runtime） | `api`/`mcp`/`converter`（`tsx --env-file`）、guarded 腳本 | gitignored |
| `.env.cloud` | B-cloud（後端雲端 runtime） | `gcloud run deploy --set-env-vars`（本機無程序讀它） | gitignored |
| `apps/web/.env.local` | C（web 本機 `NEXT_PUBLIC_*`） | Next.js（只讀 web 目錄,不讀根 `.env`） | gitignored |
| web cloud `NEXT_PUBLIC_*` | 同 C,雲端值 | build 時 `--build-arg`(無常駐檔) | — |

> **常見坑**:根 `.env` 放 `NEXT_PUBLIC_*` 是**無效的** —— web 只讀
> `apps/web/.env.local`,後端服務也不看 `NEXT_PUBLIC`。

## 兩個軸 — 用途 × 環境

```
用途＼環境  │  Local（筆電跑）           │  Cloud（部到 GCP）
───────────┼───────────────────────────┼──────────────────────────
A. CLI/部署 │      ← 同一份，跟環境無關（都是從筆電操作雲端）→
   憑證     │   SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD
           │   GOOGLE_APPLICATION_CREDENTIALS / CLOUDSDK_CORE_PROJECT
───────────┼───────────────────────────┼──────────────────────────
B. 後端     │  DATABASE_URL=127…        │  DATABASE_URL=pooler:6543…
   runtime  │  SUPABASE_URL=127…        │  SUPABASE_URL=https://…
  (api/mcp/ │  S3_ENDPOINT=127…         │  S3=hosted keys
  converter)│  CONVERTER_URL=127:8012  │  CONVERTER_URL=部署後才知道
───────────┼───────────────────────────┼──────────────────────────
C. web      │  NEXT_PUBLIC_*=127…       │  NEXT_PUBLIC_*=公開URL
   build-arg│  apps/web/.env.local      │  --build-arg（含 deploy-output）
```

**關鍵洞察:A 憑證跟 local/cloud 無關**,它是「從筆電操作雲端的鑰匙」,不管現在打
本機還雲端都是同一份 → 只在 `.env`,不分兩份。

## A 憑證是 remote-only（local Supabase 不使用）

| 變數 | local Supabase | remote Supabase |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | ❌ 不需要 | ✅ 帳號 PAT,給 `supabase link`/`db push`/`projects list` |
| `SUPABASE_DB_PASSWORD` | ❌ 不需要 | ✅ hosted 專案 DB 密碼,給 CLI/migrate 腳本連遠端 |

- `SUPABASE_ACCESS_TOKEN` 是 **Management API token**,只給操作雲端專案的 CLI 用;
  本機指令(`supabase start`/`db reset`/`status`)操作 Docker,完全不碰它。
- **本機 DB 密碼藏在 `DATABASE_URL` 字串裡**(`postgres:postgres@localhost`),所以
  `SUPABASE_DB_PASSWORD` 只代表**遠端**的密碼。兩者永不衝突:一個在連線字串、一個是
  CLI 參數。

## 雲端兩個 DB URL（同 host/帳號/密碼,只差 port）

```
DATABASE_URL         → transaction pooler :6543   ← 一般查詢
DATABASE_LISTEN_URL  → session pooler     :5432   ← LISTEN（document_changes）
```

`LISTEN` 是會話級長連線;transaction pooler 交易結束會把 `LISTEN` 丟掉,所以通知專用
連線**必須**走 session 模式(:5432)。本機不需要 `DATABASE_LISTEN_URL`(留空 = 沿用
`DATABASE_URL`)。

## Readiness — 「還沒準備好」有三種

| 標記 | 意義 | 範例 |
|---|---|---|
| `fill-me` | 值拿得到,還沒填 | `DATABASE_LISTEN_URL`、hosted S3 keys |
| `deploy-output` | 前一個服務部好才有,現在填不了 | `CONVERTER_URL`、`NEXT_PUBLIC_API_URL` |
| `optional` | 不用該功能就留空 | `MISTRAL_API_KEY`、`GEMINI_API_KEY` |

`deploy-output` 由 Cloud Run 部署步驟依 **converter → api → web** 順序邊部邊回填。

## 本機 port 與資料邊界

本專案刻意保留一組專屬本機 port，避免與其他常見的 `3000`／`8000`／`5432x` 專案互撞：

| 元件 | Port |
|---|---:|
| Web | 3010 |
| API | 8010 |
| MCP | 8011 |
| Converter | 8012 |
| Supabase API / DB / Studio | 55321 / 55322 / 55323 |

根 `.env` 的 B-local 值應全部指向同一套 local Supabase；`apps/web/.env.local` 也必須指向同一套。
若其中一個檔案仍指向 hosted Supabase，就會出現「登入成功但看不到預期資料」或 API `401` 等難以判讀的
現象。

local 與 hosted 是兩個獨立資料庫。`supabase link` 建立 CLI 與 remote 專案的關聯；`db pull`／`db push`
只同步 schema migration，並不會同步 wiki、來源檔或 Auth 使用者。內容搬遷必須依
[部署指南](/docs/deployment.md#一次性資料搬遷已完成不要當成日常部署)明確執行。

## 規則

- 有新變數 → 先進 `.env.example` 對應區塊(含 scope + readiness),再填實際檔,避免漂移。
- `.env.cloud` 只放 B-cloud;**不放** A 憑證(會洩進 service runtime)、**不放** `*_PORT`
  (Cloud Run 注入 `PORT`)、**不放** `NEXT_PUBLIC_*`(那是 build-arg)。
- `LIBREOFFICE_BIN` 值要分:本機 `soffice` / 容器 `libreoffice`。

相關:[架構總覽](/docs/architecture.md)、[Agent 作業規範](/docs/agent-protocol.md)。

# Citations

[1] [Supabase CLI reference](https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md) — `link` 關聯 remote 專案；`db pull`／`db push` 處理 schema migration。
