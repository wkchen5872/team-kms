## Why

Two `sources`(資料來源)瀏覽的 UX bug:

1. 開過某個 source 檔案後,回去點 wiki 檔案,再點側欄「所有檔案」時,會意外重新打開剛才那個 source 檔案(而非回到檔案總覽);若那是 docx 之類無法內嵌預覽的檔案,還會誤觸瀏覽器下載。
2. docx / doc / pptx / ppt 在檔案總覽點開後無法在瀏覽器內就地預覽,反而觸發下載,且下載名稱是儲存物件 key `source.docx`,而非原始檔名。

## What Changes

- 點側欄「所有檔案」一律回到「瀏覽所有檔案」狀態(清掉正在檢視的 source 檔案),不論從 wiki / graph / doc 哪個檢視切過來。
- docx / doc / pptx / ppt 在檔案檢視器改走「抽取內文」預覽(與 xlsx 一致),就地顯示抽取出的 markdown,而非塞進 PDF `<embed>` 導致誤觸下載。PDF 維持原本的 inline embed。
- 工具列「Download」按鈕維持既有行為(以原始檔名下載),不變動。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `source-file-viewing`: 「所有檔案」導覽一律重置為總覽;非 PDF 的 office 檔(docx/doc/pptx/ppt)以抽取內文就地預覽而非誤觸下載。

## Impact

- 純前端,不動 API / DB / 儲存。
- `apps/web/src/components/kb/KBDetail.tsx`:`handleFilesToggle` 在切回檔案總覽時清空 `activeSourceDocId`。
- `apps/web/src/components/kb/FilesGrid.tsx`:檔案檢視器 viewer 分派,將 `docx/doc/pptx/ppt` 從 `PdfDocViewer` 改為 `ContentViewer`。
- 無既有 `openspec/specs/` 檔(specs 目錄為空),此 capability 以 delta 形式新增描述。
