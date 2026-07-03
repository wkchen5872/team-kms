## Context

`KBDetail` 以 `activeSourceDocId` + `activeView`(`'wiki' | 'files' | 'graph' | 'doc'`)描述目前檢視。`activeSourceDocId` 只在開檔與 `handleFilesToggle` 的 `doc` 分支被清除;從 wiki/graph 進 files 的 `else` 分支不清,`FilesGrid` 收到殘留的 `initialDocId` 後 effect(`FilesGrid.tsx:220`)會 `setActiveDocId` 復活舊檔。

檔案檢視器 viewer 分派(`FilesGrid.tsx:656`)把 `pdf/pptx/ppt/docx/doc` 全丟給 `PdfDocViewer`,其實作為 `<embed type="application/pdf" src={presignedUrl}>`(`DocViewers.tsx:51`)。只有真 PDF 能 inline;docx 二進位塞入 → Chrome 下載該 S3 物件,物件 key 為 `.../source.<ext>`,故下載名為 `source.docx`。

## Goals / Non-Goals

**Goals:**
- 點「所有檔案」一律回到總覽,不復活舊檔、不誤觸下載。
- docx/doc/pptx/ppt 就地預覽抽取內文,不再誤觸下載。

**Non-Goals:**
- 不改 API / 儲存 / presigned URL 的 Content-Disposition(工具列下載已用原始檔名,無需動)。
- 不新增 docx→PDF 轉檔或 office 原生渲染。
- 不改 PDF 既有 embed 行為。

## Decisions

- **Issue 1:** `handleFilesToggle` 中,凡是導向「檔案總覽」的分支(`doc` 分支與 `else` 分支)都 `setActiveSourceDocId(null)`。最小改動:在 `else` 分支補一行。
- **Issue 2:** viewer 分派把 `docx/doc/pptx/ppt` 從 `PdfDocViewer` 條件移到 `ContentViewer`(與 `xlsx/xls/csv` 同一支),`PdfDocViewer` 僅保留 `pdf`。`ContentViewer` 走 `/content` 顯示抽取 markdown,天生 inline、零下載。

## Risks / Trade-offs

- ContentViewer 目前以 `<pre>` 呈現 markdown 原文(非渲染),office 檔的表格/圖片不會漂亮呈現 —— 與 xlsx 現況一致,可接受;若日後要美化再單獨處理。
- 若某 office 檔 `content` 為空(抽取失敗/尚未完成),ContentViewer 會顯示空白;但這類檔案 status 多為 `processing`/`failed`,已由前面的狀態分支攔截,風險低。
