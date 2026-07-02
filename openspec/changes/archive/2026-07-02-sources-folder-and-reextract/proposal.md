## Why

Sources 檔案瀏覽器有三個讓「檔案管理做不到」的缺口:資料夾**能新增卻不能刪除/改名**;非文字檔(PDF/Office/圖片)
解析或 OCR 結果不理想時**只能刪掉重傳**才能重跑,沒有「重新萃取」;而且**一次只能刪一個檔**,無法複選批次
刪除或重萃。這些都是日常整理來源檔的基本操作。

探索發現多數基礎已存在(半成品):複選狀態 `selectedIds`/`handleSelect`、`handleDeleteSelected`、
`SelectionActionBar` 都在 KBDetail,只是 `FilesGrid` 從未接上;re-extract 因為 S3 來源持久化 +
`extractionProcessor` 冪等 + `finalizeExtractedDocument` 會重建 pages/chunks,只需「重設 status=pending +
`enqueue`」;資料夾是虛擬的(path 前綴),刪/改名 = 對 path 前綴批次操作。

## What Changes

- **資料夾刪除 / 改名**:資料夾右鍵選單新增 Rename / Delete。刪除為**遞迴軟刪**(archive 該 path 前綴下所有文件)
  並先跳確認框顯示影響檔數;改名改寫該前綴下所有子孫文件的 path。後端新增 `deleteFolder`/`renameFolder`
  (service-role,path 前綴操作)與 `DELETE`/`PATCH /v1/knowledge-bases/:slug/folders` 路由。
- **文件重新萃取(re-extract)**:新增 `POST /v1/documents/:id/re-extract`——重設 `status='pending'` 並
  `enqueue(docId)`,對**已上傳的 S3 來源**重跑 PDF/Office 解析或圖片 OCR(不需重傳)。**僅限可萃取類型**
  (pdf/pptx/ppt/docx/doc/xls/xlsx/png/jpg/jpeg/webp/gif);md/txt 筆記不提供。可萃取類型集合抽成共用常數。
- **複選批次**:`FilesGrid` 接上多選 UI(**hover 顯示 checkbox** + 保留 cmd/shift-click 加速鍵 + 選取高亮),
  `SelectionActionBar` 加「Re-extract」按鈕。批次刪除/重萃沿用既有 client 端平行呼叫(`Promise.allSettled`),
  **不新增批次後端路由**。
- 進度回饋沿用既有 processing 狀態(pending→processing→ready,WebSocket 自動更新),零額外 UI。

明確**不做**:批次操作的專用後端路由、資料夾拖放/跨資料夾移動 UI(既有行為保留)。

## Capabilities

### New Capabilities
- `sources-folder-management`: 虛擬資料夾的刪除(遞迴軟刪)與改名(path 前綴改寫),含後端前綴操作與路由。
- `document-re-extraction`: 對已上傳文件重跑解析/OCR(重設 pending + enqueue),單檔與批次,僅限可萃取類型。
- `sources-batch-selection`: Sources 複選 UI(hover checkbox + 修飾鍵)驅動批次刪除與批次 re-extract。

### Modified Capabilities
<!-- openspec/specs/ 目前為空(前面 change 皆未 sync main specs),無既有 capability 需修改。 -->

## Impact

- **`packages/shared/src/vaultfs.ts`**:新增 `deleteFolder(pathPrefix)`、`renameFolder(oldPrefix, newPrefix)`(service-role,帶 `AND user_id`);重用既有 `archiveDocuments`。
- **`apps/api/src/index.ts`**:新增 `POST /v1/documents/:id/re-extract`、`DELETE`/`PATCH /v1/knowledge-bases/:slug/folders`;可萃取類型共用常數(對齊 `ingest.ts`/converter SUPPORTED);import `enqueue`。
- **`apps/web/src/components/kb/FilesGrid.tsx`**:DocumentCard 多選 checkbox + 選取態 + Re-extract context 項;FolderCard context menu(Rename/Delete)。
- **`apps/web/src/components/kb/SelectionActionBar.tsx`**:加 Re-extract 按鈕(`onReextract`)。
- **`apps/web/src/components/kb/KBDetail.tsx`**:新 handler(`handleReextractDocument`/`handleReextractSelected`/`handleDeleteFolder`/`handleRenameFolder`)+ 下傳選取/handlers 給 FilesGrid。
- **DB**:無新 migration(重用 `documents.path`/`archived`/`status`)。
- **`docs/`**:`architecture/modules/{api-server,web}.md`。
