## 1. P0 — 主題/token 地基(擋所有 UI)

- [x] 1.1 加依賴：`zustand next-themes lucide-react cmdk framer-motion @radix-ui/react-{dropdown-menu,dialog,popover,context-menu,label,slot} class-variance-authority clsx tailwind-merge sonner tus-js-client`；dev `tailwindcss-animate`
- [x] 1.2 `globals.css`：換成 pre-v4 shadcn token 區塊（`:root`/`.dark` HSL 變數 + `@layer base` border/bg + `.wiki-content` 排版；砍 `.llmwiki-hl*`/`.ProseMirror`/v4-only 語法）
- [x] 1.3 `tailwind.config.ts`：`darkMode:"class"` + `theme.extend.colors` 用 `hsl(var(--x))` 映射 + `plugins:[typography, tailwindcss-animate]`
- [x] 1.4 `lib/utils.ts`（`cn()`）；肉眼驗證 `bg-background`/`text-muted-foreground`/`size-*` 有生效

## 2. P1 — 後端路由與回傳形狀（擋資料）

- [x] 2.1 `vaultfs.listKnowledgeBases`：SELECT 補 `id`
- [x] 2.2 `vaultfs.listDocuments`：擴充欄位 + LEFT JOIN `document_raw`（`status/document_number/version/sort_order/metadata/file_size/error_message/created_at/kind`），保留 `kind <> 'asset'`
- [x] 2.3 `vaultfs.resolveKb`：接受 id 或 slug（`WHERE slug=$1 OR id::text=$1`）
- [x] 2.4 graph 路由 reshape：edges→`{source,target,type,page}`、node 加 `source_kind`
- [x] 2.5 `POST /v1/knowledge-bases/:slug/documents/note` + `vaultfs.createNote`（回完整 listDocuments-shaped row）
- [x] 2.6 `PATCH /v1/documents/:id`（body `{path}`→move / `{title}`→rename）+ `vaultfs.moveDocument`/`renameDocument`（catch 23505→409）
- [x] 2.7 `DELETE /v1/documents/:id`（archive）→204
- [x] 2.8 `PATCH` / `DELETE /v1/knowledge-bases/:slug`（service-role rename/delete，catch UNIQUE→409）+ vaultfs 方法
- [x] 2.9 `GET /v1/knowledge-bases/:slug/search?q=&limit=`（包 `searchChunks`）
- [x] 2.10 `GET /v1/documents/:id/download`（alias → source-url）
- [x] 2.11 後端測試：新路由各一條整合測試（rename/delete KB、note、move、delete、search）

## 3. P2 — 狀態 / auth 橋接

- [x] 3.1 port `lib/api.ts`（3-arg + `ApiError` + WS URL `?token=`）
- [x] 3.2 port `stores/{useUserStore,useKBStore,useUploadStore(最小),index}`
- [x] 3.3 port/改 `components/auth/AuthProvider`（改用我們 supabase singleton；砍 onboarding/local-mode/`NEXT_PUBLIC_MODE`）
- [x] 3.4 root `layout.tsx`：`ThemeProvider`(next-themes)+ `Toaster`(sonner)+ `suppressHydrationWarning`
- [x] 3.5 新增 `(dashboard)/layout.tsx`：`<AuthProvider><AppShell>`
- [x] 3.6 改 `hooks/useKBDocuments`：接我們 WS（`?token=`，去掉首訊息 auth frame）

## 4. P3 — ui primitives

- [x] 4.1 port `components/ui/*`：button/badge/input/label/dialog/dropdown-menu/popover/context-menu/command/skeleton/sonner/kbd（token 後直接能用；只帶被保留元件實際 import 的）

## 5. P4 — Shell（功能 1,5,8）

- [x] 5.1 `KBSidenav` + `WikiTreeNode`（砍 PageUsageBar/`/v1/usage`）
- [x] 5.2 `WikiSelector` + `ContextMenus`（KB 建立/改名/刪除/切換）
- [x] 5.3 `KBDetail`（改接點：TUS `/v1/files` metadata `{filename,kb}`、multipart 路由、note/patch/delete）
- [x] 5.4 路由：`(dashboard)/wikis/[slug]/[[...path]]/page.tsx`（files/graph/wiki 三視圖 + `?doc=`）；刪舊 `wikis/[slug]/page.tsx` 與 `wikis/[slug]/graph/page.tsx`；`wikis` 移進 `(dashboard)`

## 6. P5 — 功能元件（功能 2,3,6）

- [x] 6.1 `GraphViewer`（照抄，移除 Rebuild 鈕）→ **修圖譜點擊 bug**（onNodeClick→導航、path null 防護）
- [x] 6.2 `FilesGrid` + `DocViewers`：檔案網格 + lucide icon + 排序 + 建目錄/筆記；**NoteEditor→textarea**、PdfDocViewer 走 `<embed>`、砍 HtmlDocViewer/webclip
- [x] 6.3 `SelectionActionBar`（多選刪除）
- [x] 6.4 port `WikiContent`（citation/graph 連結）+ `MermaidBlock`/`DiagramViewer`

## 7. P6 — 搜尋與帳號（功能 4,7）

- [x] 7.1 驗證 KBSidenav 的 Cmd+K 面板（client 過濾）；（選）接 `/search` 做「搜全文」動作
- [x] 7.2 `SidenavUserMenu`（Settings/Dark/**Sign Out**；改用我們 supabase singleton）
- [x] 7.3 `(dashboard)/settings/page.tsx`：Dark toggle + **API keys 管理 UI**（`/v1/api-keys` list/create-once/revoke）；砍 usage/MCP-OAuth

## 8. P7 — 收尾與驗證

- [x] 8.1 刪死碼：舊 `components/{GraphViewer,WikiContent,PdfViewer}.tsx`（被取代後）
- [x] 8.2 `.env.local`/dev script：port remap（`API_PORT`/`NEXT_PUBLIC_API_URL`/`next dev -p`）供與原版並排跑
- [x] 8.3 全 workspace `tsc --noEmit` + ESLint + `pnpm test` 綠
- [x] 8.4 逐功能 e2e 驗證 8 項（見 proposal/design 驗證節）：shell/graph 導航/排序+建目錄/搜尋/wiki tree/grid+icon/帳號選單+登出/KB CRUD；並確認 API keys UI 能產 `tkms_` token
- [x] 8.5 依 openspec-commits 分批 commit（每 phase 一個 `feat(port-web-ui): ...`）
