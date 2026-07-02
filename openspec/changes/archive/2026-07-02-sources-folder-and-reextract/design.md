## Context

三項 Sources 調整。多數基礎已存在(見 proposal):複選相關程式碼在 `KBDetail` 但 `FilesGrid` 未接;
re-extract 靠既有冪等 queue;資料夾是虛擬 path 前綴。RLS:`documents` 只有 SELECT policy,所有寫入走
service-role + 明確 `AND user_id`。

## Goals / Non-Goals

**Goals:**
- 資料夾可刪(遞迴軟刪 + 確認)/ 改名(前綴改寫)。
- 已上傳文件可 re-extract(單檔 + 批次),重跑解析/OCR,不需重傳。
- Sources 複選(hover checkbox + 修飾鍵)驅動批次刪除 / re-extract。

**Non-Goals:**
- 批次操作專用後端路由(沿用 client 平行呼叫)。
- 資料夾拖放、跨資料夾移動 UI(既有行為不動)。
- md/txt 筆記的 re-extract(無可萃取內容)。

## Decisions

**D1. re-extract = 重設 status + enqueue,不新增抽取邏輯。**
`POST /v1/documents/:id/re-extract` → `serviceExecute` set `status='pending'` → `enqueue(id)`。
既有 `extractionProcessor` 讀 `{user}/{doc}/source.{ext}`(仍在)重跑,`finalizeExtractedDocument` 先
`DELETE document_pages` 再重建 chunks(冪等)。替代方案(前端刪了重傳)體驗差且浪費頻寬,不採用。

**D2. 僅可萃取類型可 re-extract。**
共用常數 `EXTRACTABLE_TYPES`(pdf/pptx/ppt/docx/doc/xls/xlsx/png/jpg/jpeg/webp/gif),與 `ingest.ts`
的分流一致。route 對非此類型回 400;前端 context menu / 批次也據此過濾(md/txt 不顯示 Re-extract)。

**D3. 資料夾 = path 前綴批次操作(無 folder 表)。**
`deleteFolder(prefix)`:`UPDATE documents SET archived=true WHERE path LIKE prefix||'%' AND user_id`。
`renameFolder(old,new)`:`UPDATE ... SET path = new || substring(path from length(old)+1) WHERE path LIKE old||'%'`。
前綴正規化為 `/…/` 結尾。改名只改最後一段(同層 rename)。

**D4. 批次走 client 平行呼叫,不做批次後端路由。**
沿用既有 `handleDeleteSelected`(`Promise.allSettled` 逐一 DELETE)模式;re-extract 批次同法逐一 POST。
queue 單執行緒會排隊處理,不壓垮 converter。資料夾整包刪/改名例外——client 無法列舉巢狀文件,走單一前綴 route。

**D5. 複選 UI:hover checkbox + 保留 cmd/shift-click。**
`FilesGrid` DocumentCard hover 顯示 checkbox,點 checkbox 或修飾鍵點擊 → 呼叫既有 `handleSelect(id, e)`
(已支援 shift 連選 / cmd 切換);選取態高亮;無選取時點擊即開。`SelectionActionBar`(已存在)自動隨
`selectedIds.size>0` 浮出,加一顆 Re-extract。

**D6. 進度回饋重用 processing 狀態。**
re-extract 後 doc 走 pending→processing→ready,FilesGrid 既有狀態徽章 + WebSocket 自動反映,不加 toast。

## Risks / Trade-offs

- **資料夾改名撞名** → 目標前綴已有同名資料夾,path 唯一約束可能 409;catch 後提示換名。
- **re-extract 併發** → 批次 N 筆逐一排隊(單執行緒 queue + converter timeout),安全但大量時較慢;可接受。
- **樂觀更新** → folder 刪/改名先樂觀改前端 state,WebSocket document_changes 補正。
- **path LIKE 前綴注入** → 前綴為系統產生 + 參數化查詢;`%`/`_` 理論上可出現在資料夾名,必要時 escape(低風險,先不處理,ponytail 註記)。

## Migration Plan

無 DB migration(重用 `path`/`archived`/`status`)。純新增後端方法/路由 + 前端接線,向後相容。

## Open Questions

- 資料夾改名是否允許移動到不同父層?本次只做同層改名(最後一段),跨層移動延後。
