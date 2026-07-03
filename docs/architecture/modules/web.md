---
type: Architecture
title: 模組解析：apps/web
description: apps/web Next.js 14 前端的路由、元件、狀態層、認證與上傳/下載/圖譜流程。
tags: [architecture, module, web]
timestamp: 2025-07-02T00:00:00Z
---

# 模組解析：apps/web

[← 返回索引](/docs/architecture.md) · [模組地圖](/docs/architecture/module-map.md)

## 職責

`apps/web` 是 Next.js 14（App Router）前端：Supabase Auth 登入/登出、知識庫 CRUD、
檔案網格與 wiki file tree 瀏覽、多檔上傳、Markdown/PDF/圖片/試算表檢視、note 編輯、
內容搜尋、可導航的知識圖譜、帳號設定（含 API keys 管理、dark mode）。前端不直連
資料庫，所有資料經 `apps/api` 的 REST/WebSocket 介面存取。UI 移植自
[lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki)（React-18 相容子集，
不升 Tailwind v4）。

## 路由（`app/`）

`(dashboard)` route group 套 `AuthProvider` + `AppShell`（固定視窗高度、內部捲動）。

| 路徑 | 檔案 | 說明 |
|---|---|---|
| `/` | `app/page.tsx` | 認證守衛：有 session 導向 `/wikis`，否則 `/login` |
| `/login` | `app/login/page.tsx` | Email/password 登入，`supabase.auth.signInWithPassword()` |
| `/wikis` | `app/(dashboard)/wikis/page.tsx` | 知識庫列表（`GET /v1/knowledge-bases`） |
| `/wikis/:slug/[[...path]]` | `app/(dashboard)/wikis/[slug]/[[...path]]/page.tsx` | 主工作頁（optional catch-all）：一頁涵蓋 `/wikis/:slug`、`/files/...`、`/graph`，並用 `?doc=` 同步開啟的文件 |
| `/settings` | `app/(dashboard)/settings/page.tsx` | 帳號設定：dark mode 切換、API keys 建立（一次性顯示）/列表/撤銷 |

`app/layout.tsx` 為 root layout，掛 `ThemeProvider`（next-themes，class 模式）+ `Toaster`（sonner）。

## 元件（`components/`）

| 區塊 | 元件 | 職責 |
|---|---|---|
| `kb/` | `KBDetail` | 工作頁殼：整合 sidenav + 內容區，管理 files/wiki/graph view 切換與 URL 同步、文件 CRUD（note/folder/move/rename/delete）、上傳 |
| `kb/` | `KBSidenav` | 左側欄：來源清單、wiki file tree（巢狀展開 + active 高亮）、上傳、底部帳號選單 |
| `kb/` | `FilesGrid` + `DocViewers` | 檔案網格（依 `file_type` 顯示 lucide icon、name/date/type 排序、搜尋、資料夾）＋各型檢視器（PDF `<embed>`、圖片、office/試算表以抽取內文就地預覽（docx/doc/pptx/ppt/xlsx/xls/csv 走 `ContentViewer`，避免非 PDF 檔塞進 PDF embed 而誤觸下載）、note textarea、processing/failed 狀態）。多選（hover checkbox + cmd/shift-click）驅動 `SelectionActionBar` 批次刪除 / re-extract；資料夾右鍵可改名/刪除；可萃取檔右鍵可 Re-extract（`POST /re-extract`） |
| `kb/` | `GraphViewer` | `react-force-graph-2d`（`ssr:false`）力導向圖，**點節點導航**（`onNodeClick`，path 為 null 不崩） |
| `kb/` | `WikiSelector` / `ContextMenus` / `SelectionActionBar` | KB 下拉（view all / rename / delete / create）、右鍵選單、多選操作列 |
| `kb/` | `SidenavUserMenu` | 帳號選單：Settings 連結、Dark mode、Sign Out（`supabase.auth.signOut()`） |
| `kb/` | `NoteEditor` | raw markdown 編輯（textarea，非 tiptap），`PATCH /v1/documents/:id {content}` |
| `wiki/` | `WikiContent` / `MermaidBlock` / `DiagramViewer` | wiki 頁 markdown 渲染（含 citation/graph 連結）＋ mermaid（katex 已移除） |
| `layout/` | `AppShell` | `h-screen overflow-hidden` 外殼，讓 sidebar 固定高度、內容區自行捲動 |
| `auth/` | `AuthProvider` | 從 Supabase session 取 token 灌入 `useUserStore`，作為元件與後端的橋接層 |
| `ui/` | shadcn primitives | button/dialog/dropdown-menu/popover/context-menu/command/input/label/badge/skeleton/sonner/kbd/textarea… |

## 狀態與資料層（`stores/` `hooks/` `lib/`）

- **`lib/api.ts`**：`apiFetch<T>(path, token, init?)` — **3 引數**（token 由呼叫端從
  `useUserStore` 取），設 `Authorization: Bearer`、非 FormData 自動帶 JSON content-type、
  非 2xx throw `ApiError`。讀 `NEXT_PUBLIC_API_URL`（預設 `http://localhost:8000`）。
  另有 `getDocumentsWsUrl(kbId, token)` → `…/v1/ws/kb/:kbId?token=`。
- **`stores/`**（zustand）：`useUserStore`（session token）、`useKBStore`（知識庫列表）、
  `useUploadStore`（上傳進度）。
- **`hooks/useKBDocuments.ts`**：載入文件清單 + 訂閱 WebSocket 即時更新。
- **`lib/supabase.ts`**：以 `NEXT_PUBLIC_SUPABASE_URL` + `_ANON_KEY` 初始化 client
  （`persistSession` + `autoRefreshToken`），全域 singleton。

## 認證流程

1. App 啟動初始化 Supabase client，自 localStorage 還原 session。
2. `/login` 提交 → `signInWithPassword()` → JWT 存 localStorage → 導向 `/wikis`。
3. `AuthProvider` 監聽 session，把 `access_token` 寫入 `useUserStore`。
4. 每次 `apiFetch(path, token, …)` 附 `Authorization: Bearer`；後端做 JWT 驗證 + RLS 範圍限定。
5. `SidenavUserMenu` → Sign Out：`supabase.auth.signOut()` 清 session → 回 `/login`。
   > 密碼由 Supabase Auth（`auth.users`）管理，`public.users` 不存密碼；重設走 Supabase Studio 或 admin API。

## 多檔上傳流程（TUS）

- 走 **TUS 1.0 續傳協議**（`tus-js-client`）打 `/v1/files`，metadata 帶 `{filename, kb: slug}`。
- 上傳完成後端非同步 ingest（解析佇列）；前端經 WebSocket 收到 `processing → ready/failed` 更新。
- 上傳暫落知識庫根目錄（metadata 尚未帶 path）。

## 下載流程

- 瀏覽器導航帶不了 `Authorization` header，且 presigned S3 URL 跨來源會讓 `download` 屬性失效。
- 因此 `FilesGrid` 用 token 打 `/v1/documents/:id/source-url` 取 presigned URL → `fetch` 成
  **同源 blob** → `<a download=原檔名>` 觸發（PDF 也會強制下載而非 inline 開啟）。
- note/webclip 無 `source.*` 物件，改抓 `/content` 的 markdown 存成 `.md`。

## 圖片 / asset 渲染

- `WikiContent` 圖片解析器處理三種 src：相對檔名（比對 documents 找 asset）、`data:`/`http` 直出、
  以及 **`asset:<docId>`**（PDF 抽出的內嵌圖，直接對該 asset 文件打 `/source-url` 取 presigned URL）。
- 直接上傳的圖片是一般 source 文件（`png/jpg/...`），在 FilesGrid 由 `ImageViewer` 走 `/source-url` 呈現。

## 知識圖譜視覺化資料流

```
GET /v1/knowledge-bases/:slug/graph
  → { nodes: [{ id, …, source_kind: "wiki"|"source" }],
      edges: [{ source, target, type, page }] }
  → GraphViewer 轉為 react-force-graph-2d 格式（依 source_kind 配色、方向箭頭）
  → 點節點 → onNodeClick 導航到該文件（path 為 null 時安全處理）
```

## 依賴關係

- 依賴 `apps/api`（唯一資料來源，經 REST + WebSocket）。
- 依賴 Supabase Auth（前端直連，取得/刷新 JWT）。
- 維持 **React 18 / Next 14 / Tailwind v3**（pre-v4 shadcn token 系統：`globals.css` HSL 變數
  + config `hsl(var(--x))` 映射 + `tailwindcss-animate`）。
- **視覺對齊 `docs/design/default`**：light `:root` 採 slate/blue 色盤（bg #f8fafc、ink #0f172a、
  accent-blue #3b82f6、radius 12px）+ 狀態 token `--success`/`--warning`；**dark（`.dark`）維持原樣**。
  無主題切換器、無 ctc（僅現有 light/dark 切換）。
- 關鍵套件：`next@^14`、`react@^18`、`@supabase/supabase-js`、`zustand`、`next-themes`、
  `lucide-react`、`cmdk`、`framer-motion`、Radix UI、`sonner`、`tus-js-client`、
  `react-markdown`、`mermaid`、`react-force-graph-2d`。

# Citations

[1] [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — 前端 UI 移植來源（React-18 相容子集，未升 Tailwind v4）。
