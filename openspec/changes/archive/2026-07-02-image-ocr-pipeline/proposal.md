## Why

圖片能力目前完全缺席,而且**直接上傳圖片是壞的**:JPG/PNG 被當成一般 binary 丟給只支援 PDF/Office 的 converter,被退回 → 文件卡在 pending/failed。PDF 內嵌圖也只留下指向暫存目錄(已刪)的死連結 `![image](source_images/...)`,`document_pages.elements` 永遠 null。表格/流程圖裡的關鍵資料因此完全遺失——既無法被 Claude 看到,也無法被搜尋。

## What Changes

- **converter 抽圖**:opendataloader 呼叫改帶 `imageOutput: "embedded"`(現用預設 `external` → 死連結的根因),把內嵌圖以 base64 data URI 抽出,回傳圖 bytes + 每頁 `elements`。**BREAKING(內部)**:converter `/extract` 回傳形狀擴充(`pages[].images`、`page_elements`)。
- **ingest 存 asset**:PDF 抽出的圖 bytes 上傳 **Supabase Storage**,每張建一筆 `source_kind='asset'`(hidden、`parent_document_id`)子文件;填 `document_pages.elements = {"images":[{id,src,filename}]}`;把 page markdown 的圖連結改寫成 asset 穩定路徑。
- **直接上傳圖片分支**:JPG/PNG 走**新的 ingest 分支**(不經 converter),存 asset + OCR,狀態正常收斂 ready。修好目前壞掉的圖片上傳。
- **multi-provider OCR**:新增 `OcrProvider` 介面 + `MistralProvider` / `GeminiProvider`,對圖片抽出文字/描述(表格/流程圖的關鍵資料);OCR 文字併入 chunks 供搜尋。OCR 為**可選、可換 provider**,失敗不阻斷 ingest(優雅降級)。
- **MCP read 圖片**:`read(include_images=true)` 從 `elements` 載 asset bytes,以 base64 ImageContent 回給 Claude(上限比照原版 12 張)。目前 `apps/mcp/src/tools.ts` 的 read 明確 drop 圖 → 改為可選帶回。

明確**不做**:掃描檔全頁 OCR 當主要後端(`OcrProvider` 介面預留但本次以「對抽出的圖後處理」為主)、webclip 圖片管線、圖片 embedding 向量化。

## Capabilities

### New Capabilities
- `image-asset-ingestion`: 從 PDF 抽出內嵌圖並存成 asset(Supabase Storage + asset 文件 + `document_pages.elements` + markdown 連結改寫),以及直接上傳 JPG/PNG 的專屬 ingest 分支。
- `image-ocr`: 可插拔的多 provider(Mistral + Gemini)OCR,對圖片抽出可搜尋文字,於 ingest 階段執行、失敗可降級、文字併入索引。
- `mcp-image-read`: MCP `read(include_images=true)` 把圖片以 base64 回給 Claude 供視覺判讀。

### Modified Capabilities
<!-- 目前 openspec/specs/ 為空(前面的 change 皆未 sync main specs),無既有 capability 需要修改。 -->

## Impact

- **`apps/converter`**:`extract.ts`(imageOutput=embedded + data-URI 解析)、`markdown.ts`(image 元素改帶結構化 src)、`index.ts` `/extract` 回傳形狀、`SUPPORTED` 是否納入圖片格式。
- **`apps/api`**:`ingest.ts`(圖片分支 + asset 建立 + elements)、`jobs.ts`/`converter-client.ts`(回傳形狀)、新 `ocr/` provider 模組、chunk 索引納入 OCR 文字。
- **`packages/shared`**:`vaultfs.ts`(`finalizeExtractedDocument` 寫 elements、建 asset 文件、`load_image/asset_bytes` 等價讀取)。
- **`apps/mcp`**:`tools.ts` read 支援 `include_images`、`server.ts` tool schema 加參數。
- **DB**:`document_pages.elements` 開始被寫入(欄位已存在,無需 migration);asset 走既有 `documents.kind='asset'` + `document_raw`(schema 已支援)。
- **依賴/設定**:新增 Mistral / Gemini API 呼叫(env key);Supabase Storage 沿用既有 `s3FromConfig()`。
- **`docs/`**:`modules/converter.md`、`modules/api-server.md`、`modules/web.md`、`architecture/workflows.md`。
