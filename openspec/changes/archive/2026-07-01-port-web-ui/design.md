## Context

我們的 `apps/web` 是 llmwiki 的最小移植(只有 Tailwind + 少數元件)。原版 web
(`/Users/chenwenkai/wk_projects/llmwiki/web`)是完整版(React 19 / Next 16 / Tailwind v4 / shadcn +
Radix + zustand + cmdk + next-themes + framer + tiptap)。目標:把原版的豐富 UI 照搬進我們的 web、
接我們的後端、砍掉不做的功能,達到功能對等 + 外觀相近。

## Goals / Non-Goals

**Goals:** 功能對等(補齊登出/搜尋/API-keys/文件與 KB CRUD/圖譜導航)、外觀近原版、盡量逐字照抄
以利日後 re-sync、對既有後端零破壞、無需新 migration。

**Non-Goals:** 升級 React19/Next16/Tailwind v4;tiptap 富文字;圖片能力(OCR/抽圖);metadata 瘦身;
graph rebuild;KB public 分享;TUS 指定上傳目錄。

## Decisions

### D1. 維持 React 18 / Next 14 / Tailwind v3,不升級
新增的依賴(Radix、cmdk、framer、next-themes、lucide、zustand)都支援 React 18。升級會連鎖 Next16/
React19 大改。→ 只 port「pre-v4 shadcn」的 token 系統(見 D2)。

### D2. Tailwind v4 → v3 token 移植(最高風險機械步驟)
原版 `globals.css` 用 v4 語法(`@import "tailwindcss"`/`@theme`/`@custom-variant dark`/`tw-animate-css`),
所有照搬元件依賴 token utility(`bg-background`/`text-muted-foreground`/`border-border`…)。
→ 我們保留 `@tailwind base/components/utilities`,在 `:root`/`.dark` 定義 HSL 變數,
`tailwind.config.ts` 用 `hsl(var(--x))` 映射 + `darkMode:"class"` + `tailwindcss-animate`(取代
`tw-animate-css`)。做對一次,元件即「直接能用」;若元件看起來沒樣式,幾乎都是漏了某個 token 映射。

### D3. 採用原版 zustand + 3-arg apiFetch + AuthProvider 當橋接層
原版元件都呼叫 `apiFetch(path, token, opts)` 並從 `useUserStore` 拿 token/user。逐處改成我們的
supabase-inline 2-arg fetch 會動到數十處、且永久偏離上游。→ port `lib/api.ts`(3-arg)+
`stores/{useUserStore,useKBStore,useUploadStore}` + `AuthProvider`(唯一橋接:讀 supabase session →
`setUser/setAccessToken` → `onAuthStateChange` 保鮮 → `fetchKBs()`)。zustand ~1KB,是讓照搬成立的機制,
非過度設計。WS URL 改成我們的 `/v1/ws/kb/:kbId?token=`。

### D4. 後端零 migration,重用既有 schema
KB rename/delete 走 **service-role**(`knowledge_bases` 只有 SELECT RLS policy,比照既有
`insertKnowledgeBase`);文件 delete 用既有 `archiveDocuments`(軟刪);move/rename 用 targeted UPDATE
(不走 `updateDocument`,那會 re-chunk)。`resolveKb` 改接 id-or-slug 讓 UUID 路由與 slug 路由並存。
graph 在路由層 reshape(edges→`{source,target,type,page}`、node 加 `source_kind = kind==='wiki'?'wiki':'source'`)
讓 `GraphViewer` 逐字照抄。

### D5. 砍掉的功能用最小替身,避免拖進整條依賴鏈
- NoteEditor(tiptap+highlights)→ 受控 `<textarea>` markdown(load content / blur PATCH)
- PdfDocViewer(react-pdf)→ 沿用我們 `<embed>` + `/source-url`
- HtmlDocViewer / webclip / KB 分享 / local-mode / `/v1/usage` / MCP-OAuth → 移除該分支
- graph Rebuild 鈕 → 移除(rebuild 端點延後)

## Risks / Trade-offs

- [規模:實質前端重寫,KBDetail 940 行 / FilesGrid 900 行] → 分 8 phase、分批 commit;先跑通地基(P0/P1/P2)。
- [Tailwind token 移植出錯 → 全站沒樣式] → P0 先做並肉眼驗證幾個 token class 有生效再往下。
- [`kind` vs `source_kind` 落差] → 集中在 graph 路由與 KBDetail 的 `/wiki/` path 分流映射;asset 由
  `listDocuments` 濾掉不外露。
- [照抄拖進砍掉的子系統(imports)] → 逐檔檢查 imports:FilesGrid→NoteEditor/DocViewers、
  WikiContent→math plugins、Auth/UserMenu→`lib/supabase/client`、KBSidenav→`/v1/usage`,各自剝除分支。
- [TUS 上傳暫落根目錄(metadata 未帶 path)] → 標記為已知限制,之後補。
- [Port 共存 :8000/:3000 衝突] → env remap(`API_PORT`/`APP_URL`/`NEXT_PUBLIC_API_URL`/`next dev -p`),不改碼。

## Migration Plan

無 DB migration。前端漸進:P0 地基 → P1 後端路由/形狀 → P2 狀態橋接 → P3 ui → P4 shell → P5 功能元件 →
P6 搜尋/帳號 → P7 收尾(刪舊精簡元件)。每 phase 可獨立 typecheck + 局部驗證後 commit。

## Open Questions

- 上傳走 TUS 還是 multipart 為主(現況兩條都有)——實作時擇一為預設,另一保留。
- KB list 頁是否保留獨立 `/wikis`,或完全由 shell 內 WikiSelector 取代(先保留 `/wikis` 當入口)。
