# 模組解析：apps/web

[← 返回索引](../../architecture.md) · [模組地圖](../module-map.md)

## 職責

`apps/web` 是 Next.js 14（App Router）前端：Supabase Auth 登入、知識庫瀏覽、多檔上傳、
Markdown/PDF 檢視、知識圖譜視覺化。前端不直連資料庫，所有資料經 `apps/api` 的 REST/
WebSocket 介面存取。

## 路由（`app/`）

| 路徑 | 檔案 | 說明 |
|---|---|---|
| `/` | `app/page.tsx` | 認證守衛：檢查 Supabase session，登入則導向 `/wikis`，否則導向 `/login` |
| `/login` | `app/login/page.tsx` | Email/password 登入表單，呼叫 `supabase.auth.signInWithPassword()` |
| `/wikis` | `app/wikis/page.tsx` | 知識庫列表（`GET /v1/knowledge-bases`） |
| `/wikis/:slug` | `app/wikis/[slug]/page.tsx` | 主要工作頁：側欄（導覽/上傳/wiki 頁/來源清單）+ 內容區（Markdown 或 PDF），多檔上傳 UI |
| `/wikis/:slug/graph` | `app/wikis/[slug]/graph/page.tsx` | 知識圖譜視覺化（`GET /v1/knowledge-bases/:slug/graph`） |

`app/layout.tsx` 為 root layout，設定 metadata 與全域樣式。

## 元件（`components/`）

| 元件 | 職責 |
|---|---|
| `WikiContent.tsx` | 用 `react-markdown` 渲染 Markdown；攔截 `language-mermaid` code block，交給 `MermaidBlock` 渲染 |
| `MermaidBlock.tsx` | 動態載入 `mermaid`，呼叫 `mermaid.render()`（neutral 主題）產生 SVG；渲染失敗則退回顯示原始 chart 文字 |
| `PdfViewer.tsx` | 抓取 `/v1/documents/:id/source-url` presigned URL，用瀏覽器原生 `<embed type="application/pdf">` 呈現（未用 pdf.js） |
| `GraphViewer.tsx` | 用 `react-force-graph-2d`（`ssr: false` 動態載入）呈現力導向圖；把 API 的 `GraphData` 轉為 nodes（`name`=path+filename，`type`=wiki/source）與 links（含方向箭頭），依 `type` 自動配色 |

## `lib/`

- **`api.ts`**：
  - `apiFetch<T>(path, init)` — 通用 fetch wrapper：取 Supabase session token、
    設定 `Authorization: Bearer` 標頭、非 FormData 時自動推斷
    `content-type: application/json`、非 2xx 時 throw。讀取 `NEXT_PUBLIC_API_URL`
    （預設 `http://localhost:8000`）。
  - 匯出型別：`KnowledgeBase { id, name, slug }`、
    `DocumentMeta { id, filename, title, path, file_type }`、
    `GraphData { nodes: DocumentMeta[], edges: {...} }`。
- **`supabase.ts`**：以 `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  初始化 Supabase client，`persistSession: true`（localStorage）、`autoRefreshToken: true`。

## 認證流程

1. App 啟動時初始化 Supabase client，自動從 localStorage 還原 session。
2. `/login` 提交 email/password → `supabase.auth.signInWithPassword()` → 成功後 JWT
   session 存於 localStorage → 導向 `/wikis`。
3. Session 過期前 Supabase client 自動 refresh token。
4. 每次 `apiFetch()` 呼叫都會即時取得目前 session 的 `access_token`，附加為
   `Authorization: Bearer` 標頭；後端依此做 JWT 驗證 + RLS 範圍限定。

## 多檔上傳流程

- UI：`<input type="file" multiple>`，上傳中 disable。
- **依序（非平行）**處理每個檔案：
  1. 建立 `FormData`，欄位 `"file"`。
  2. `POST /v1/knowledge-bases/:slug/upload`。
  3. 更新進度顯示（`N/M`）。
  4. 失敗則收集檔名，最後統一提示。
- 全部完成後呼叫 `refreshDocs()` 更新文件清單。
- 未使用 TUS 協議（後端雖支援，但前端目前走簡單 multipart，依序處理以配合後端解析佇列的併發上限）。

## 知識圖譜視覺化資料流

```
GET /v1/knowledge-bases/:slug/graph
  → { nodes: [{ id, filename, title, path, file_type }],
      edges: [{ source_document_id, target_document_id, reference_type }] }
  → GraphViewer 轉換為 react-force-graph-2d 格式
  → nodes: { id, name: "{path}{filename}", type: "wiki"|"source" }
  → links: { source, target, kind: reference_type }
  → 力導向佈局，依 type 自動配色，含方向箭頭
```

## 依賴關係

- 依賴 `apps/api`（唯一的資料來源，經 REST + WebSocket）。
- 依賴 Supabase Auth（前端直連，取得/刷新 JWT）。
- 關鍵套件：`next@^14.2.15`、`react@^18.3.1`、`@supabase/supabase-js@^2.45.4`、
  `react-markdown@^9.0.1`、`mermaid@^11.4.0`、`react-force-graph-2d@^1.25.5`。
