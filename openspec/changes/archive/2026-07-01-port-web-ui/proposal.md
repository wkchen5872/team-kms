## Why

用 web 前端當「功能驗收鏡子」後發現:我們移植 llmwiki 時 web 只做了最小版,導致使用者**透過網頁
根本做不到**一批功能——不能登出、不能搜尋、拿不到 MCP token(API keys 無 UI)、不能刪文件 / 改名或
刪 KB / 建目錄整理、圖譜點節點會崩。這些是 port 的功能缺口。使用者決定一次補齊(A+B),並**先照抄
原版 lucasastorian/llmwiki 的豐富 UI**,之後再自行微調。本 change 把原版那套 web 移植進 `apps/web`、
接上我們的後端,並補齊缺的後端路由。

## What Changes

- **前端**:採原版 stack 的 React-18 相容子集(zustand、next-themes、lucide-react、cmdk、
  framer-motion、Radix/shadcn ui、sonner、tus-js-client),照搬原版元件(KBDetail / KBSidenav /
  FilesGrid / GraphViewer / WikiSelector / SidenavUserMenu / WikiContent / ui primitives),接我們後端。
- **主題**:port pre-v4 shadcn token 系統到 Tailwind v3(`globals.css` HSL 變數 + config 映射 +
  `tailwindcss-animate`)+ next-themes dark mode。**維持 React 18 / Next 14 / Tailwind v3**(不升 v4)。
- **路由**:改用 `(dashboard)` route group + `wikis/[slug]/[[...path]]` optional catch-all(涵蓋
  `/wikis/:slug`、`/files/...`、`/graph`),新增 `/settings`。
- **後端補齊路由**:KB rename(PATCH)/ delete(DELETE)、文件 create-note-folder(POST)/ move+rename
  (PATCH)/ delete(DELETE)、`search?q=`、`download` alias;並修回傳形狀(`listKnowledgeBases` 補 `id`、
  `listDocuments` 擴欄 + LEFT JOIN document_raw、`resolveKb` 接 id-or-slug、graph route reshape)。
- **修 bug**:圖譜點節點導航(現在無 onNodeClick + path null 崩)。
- **接上既有但沒 UI 的功能**:登出(supabase signOut)、API keys 管理(`/v1/api-keys` 已有 CRUD)。
- **BREAKING(內部)**:退役我們現有的精簡元件(`components/{GraphViewer,WikiContent,PdfViewer}.tsx`
  與 `wikis/[slug]/page.tsx`、`wikis/[slug]/graph/page.tsx`)。無對外 API 破壞。

明確**不做**:圖片能力(OCR / PDF 抽圖 / read include_images)、metadata 瘦身、graph rebuild、
KB public 分享(006)、tiptap 富文字編輯(NoteEditor 改用 textarea)、TUS 上傳指定目錄(暫落根)。

## Capabilities

### New Capabilities
- `web-knowledge-base-workspace`: web 的知識庫工作區——app shell(側欄 + 主區)、KB 切換下拉
  (列出 / 建立 / 重新命名 / 刪除 / 切換)、側欄的 wiki file tree 與 sources 清單、`[[...path]]` 路由與
  三種主視圖(files / graph / wiki)切換。
- `web-document-operations`: 透過 web 對文件的操作——檔案網格(依 file_type 顯示 icon)、排序
  (name/date/type)、建目錄 / 建筆記、移動、刪除、上傳,以及圖譜點節點導航到對應文件。
- `web-content-search`: 從 web 對知識庫內容做全文搜尋(後端 `search` 路由 + 側欄 Cmd+K 面板)。
- `web-account-settings`: 帳號與設定——登入 / 登出、側欄底部帳號選單、Dark Mode 切換、settings 頁、
  API keys 管理(自助產生 `tkms_` token 接 MCP)。

### Modified Capabilities
<!-- openspec/specs/ 目前為空(port change 未 sync baseline),無既有 spec 需修改。 -->

## Impact

- **`apps/web`**：新增依賴;新增 `components/{ui,kb,auth,wiki}/*`、`stores/*`、`hooks/useKBDocuments`、
  `lib/{utils,api(3-arg)}`;改寫 `app/layout.tsx`、`globals.css`、`tailwind.config.ts`、路由
  (`(dashboard)` group + `[[...path]]` + `/settings`);退役舊精簡元件與舊 `[slug]` 頁。
- **`apps/api/src/index.ts`**：新增 KB PATCH/DELETE、documents POST-note / PATCH / DELETE、
  `search`、`download` 路由;調整 graph 路由回傳形狀。
- **`packages/shared/src/vaultfs.ts`**：`listKnowledgeBases` 補 id、`listDocuments` 擴欄 + join
  document_raw、`resolveKb` id-or-slug、新增 `createNote/moveDocument/renameDocument/
  renameKnowledgeBase/deleteKnowledgeBase`(KB 兩者走 service-role)。
- **無需新 migration**(重用 archived 軟刪、path/title、既有 schema)。
- **Port 共存**:與原版並排跑時以 env remap(`API_PORT`/`NEXT_PUBLIC_API_URL`/`next dev -p`)避開
  :8000/:3000 衝突,不改碼。
- 對外 REST / MCP 介面無破壞。
