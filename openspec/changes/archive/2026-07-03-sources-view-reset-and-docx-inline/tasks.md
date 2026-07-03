## 1. Issue 1 — 「所有檔案」重置為總覽

- [x] 1.1 `KBDetail.tsx` `handleFilesToggle`:從 wiki/graph 進 files 的 `else` 分支補 `setActiveSourceDocId(null)`,確保切回總覽時清除正在檢視的 source 檔案
  - 測試要求(手動,apps/web 無測試 harness):開 source 檔 → 切 wiki 點 wiki 檔 → 點「所有檔案」→ 顯示 grid、不重開舊檔、不觸發下載

## 2. Issue 2 — Office 文件就地預覽抽取內文

- [x] 2.1 `FilesGrid.tsx` viewer 分派:`PdfDocViewer` 只留 `pdf`;`docx/doc/pptx/ppt` 併入 `ContentViewer` 分支(與 xlsx 同)
  - 測試要求(手動):點開 docx → 就地顯示抽取內文、不觸發下載;PDF 仍 inline embed;工具列 Download 仍以原始檔名下載

## 3. 驗證

- [x] 3.1 `pnpm --filter @team-kms/web exec tsc --noEmit` 綠
- [x] 3.2 `pnpm --filter @team-kms/web build` 通過
