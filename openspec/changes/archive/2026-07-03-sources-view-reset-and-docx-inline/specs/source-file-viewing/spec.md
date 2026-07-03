## ADDED Requirements

### Requirement: 「所有檔案」導覽一律重置為總覽

點選側欄「所有檔案」(Data Sources)時,系統 SHALL 一律切換到「瀏覽所有檔案」的總覽狀態,並清除任何正在檢視中的 source 檔案,不論當前是 wiki、graph 或已開啟某個 source 檔案的檢視。

#### Scenario: 從 wiki 檢視切回檔案總覽不重開舊檔

- **WHEN** 使用者先開啟過某個 source 檔案,之後切到 wiki 檢視並點選一個 wiki 檔案,再點選側欄「所有檔案」
- **THEN** 系統顯示檔案總覽(grid),且不重新開啟先前檢視過的 source 檔案

#### Scenario: 切回總覽不觸發下載

- **WHEN** 先前檢視過的 source 檔案為無法內嵌預覽的型別(如 docx),使用者點選「所有檔案」
- **THEN** 系統顯示檔案總覽,且不觸發任何瀏覽器下載

### Requirement: Office 文件以抽取內文就地預覽

在檔案檢視器開啟 `docx` / `doc` / `pptx` / `ppt` 檔案時,系統 SHALL 顯示該檔案抽取出的內文(markdown),而非嘗試以 PDF 內嵌方式呈現。PDF 檔案 SHALL 維持既有的內嵌(embed)預覽。

#### Scenario: 點開 docx 就地顯示內文

- **WHEN** 使用者在檔案總覽點開一個 `docx` 檔案
- **THEN** 檢視器就地顯示抽取出的內文,且不觸發瀏覽器下載

#### Scenario: 工具列下載使用原始檔名

- **WHEN** 使用者在檔案檢視器工具列點選「Download」
- **THEN** 系統以該文件的原始檔名下載檔案(而非儲存物件 key `source.<ext>`)
