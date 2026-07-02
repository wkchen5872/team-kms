## Context

系統鐵律:**後端零 LLM 呼叫**,Claude 透過 MCP `read` 當大腦。抽取分兩層——converter(無狀態、確定性 bytes→markdown)與 ingest orchestrator(有狀態、擁有文件生命週期、寫 DB/storage)。目前我們 port 的是原版**刻意 image-blind 的 converter 路**,所以:

- PDF 內嵌圖:opendataloader 用預設 `imageOutput: "external"` → 圖寫進暫存目錄、markdown 引用 `source_images/...`,暫存目錄隨即被 `rm -rf` → 死連結;`document_pages.elements` 從未寫入。
- 直接上傳 JPG/PNG:`ingest.ts` 把非 text 檔一律當 binary 丟 converter,而 converter `SUPPORTED` 只有 pdf/office → 回 400 → 文件卡在 pending / 最終 failed。

已驗證:Node `@opendataloader/pdf@2.4.7` `ConvertOptions.imageOutput` 支援 `embedded`(base64 data URI)。原版的圖片能力(`pdf_extract.py` + `extracted_assets.py` + `ocr.py` + `read.py include_images`)是這次要對齊的目標。

## Goals / Non-Goals

**Goals:**
- PDF 內嵌圖抽成 bytes → 存 Supabase Storage 為 asset,`document_pages.elements` 正確寫入,markdown 圖連結改寫成 asset 穩定路徑。
- 直接上傳 JPG/PNG 有專屬 ingest 分支(不經 converter),正常收斂 ready。
- 可插拔多 provider OCR(Mistral + Gemini)對圖抽文字,文字併入搜尋索引;OCR 失敗不阻斷 ingest。
- MCP `read(include_images=true)` 回 base64 圖給 Claude。

**Non-Goals:**
- 掃描檔「整份 PDF OCR」當主要抽取後端(`OcrProvider` 介面預留,本次以「對抽出的圖後處理」為主)。
- webclip 遠端圖片管線、圖片向量 embedding、PDF 全頁 rasterization。
- 前端上傳 UI 改版(沿用現有 TUS)。

## Decisions

**D1. 抽圖放 converter(傳 `imageOutput: "embedded"`),不在 api in-process。**
維持微服務邊界:converter 仍是唯一抽取器,回傳 `pages[].images[] = {id, dataBase64, format}` + per-page `elements`。替代方案(原版 hosted 的 in-process opendataloader)會在 api 內另起一條抽取路、複製邏輯——我們沒有那層,不採用。

**D2. OCR 放 ingest orchestrator,不放 converter。**
OCR 要 API key、打外部 LLM、結果要持久化+索引、可選、可換 provider、失敗要能單獨重試——全是有狀態的協調關注點。converter 保持純函數(可快取/可測/無秘鑰)。

**D3. OCR 以「對抽出的圖後處理」為主(A 式),而非「整份文件 OCR 後端」(B 式)。**
opendataloader 已把文字(含框線表格)轉 markdown;需要 OCR 的正是它抽出的圖(圖表/流程圖)。`OcrProvider` 介面設計成也能接受整頁圖(未來 B 式掃描檔可切),但本次只接線 A。

**D4. `OcrProvider` 介面 + Mistral / Gemini 兩實作。**
```
interface OcrProvider { ocrImage(bytes, mime): Promise<{ text: string }> }
```
provider 由 env 選(如 `OCR_PROVIDER=gemini|mistral|none`)。回應形狀差異在各 provider 內正規化。`none` = 不做 OCR(維持零 LLM,只存圖給 Claude 看)。

**D5. 圖片存成 asset 文件,重用既有 schema,無 migration。**
每張圖 → 一筆 `documents`(`kind='asset'`、`metadata.hidden=true`、`parent_document_id`)+ `document_raw`(bytes 存 Supabase Storage,key `{user}/{assetDocId}/source.{fmt}`)。`document_pages.elements` 寫 `{"images":[{id,src,filename}]}`。OCR 文字寫入 asset 的 content / 併入 parent 的 chunks 供搜尋。

**D6. 直接上傳圖片專屬分支。**
`ingest.ts` 加 `IMAGE_TYPES`(png/jpg/jpeg/webp/gif):跳過 converter,直接建文件 + 存 Storage + OCR + ready。修好目前壞掉的路徑。

**D7. MCP read include_images。**
`read(path, pages, include_images)` 查 `elements.images` → 載 asset bytes → base64 ImageContent,上限 12 張(比照原版)。

**D8. OCR 優雅降級。**
OCR 失敗(限流/當機)→ 記 warning、圖仍存為 asset、文件照樣 ready(缺 OCR 文字),可日後重試。converter 抽取失敗才是硬失敗。

## Risks / Trade-offs

- **OCR 成本 / 延遲 / 限流** → OCR 可選(`none` 預設關)、只對抽出的圖(非全文)、可設每份上限、於背景 ingest 執行、失敗降級。
- **base64 data URI 撐大記憶體**(大圖 / 多圖 PDF)→ converter 端設單圖尺寸與每頁張數上限,超過則略過並回 warning(不靜默截斷)。
- **Node opendataloader `imageOutput=embedded` 行為可能與 Python 版有出入** → 用真實含圖 PDF 寫 live 測試驗證 data URI 解析。
- **Mistral / Gemini 回應形狀不同** → `OcrProvider` 內正規化;各 provider 一個小 live 測試(有 key 才跑)。
- **asset 重複**(同圖多頁 / 重新 ingest)→ 沿用 `file_hash` per-asset dedup。
- **converter 回傳形狀變更(BREAKING 內部)** → api `converter-client` 與 converter 同步部署;新欄位可選,舊 api 容忍。

## Migration Plan

- **無 DB migration**(`document_pages.elements`、`documents.kind='asset'`、`document_raw` 皆已存在)。
- 部署順序:先 converter(回傳擴充,向後相容)→ 再 api(消費新欄位 + OCR)。
- 新 env:`OCR_PROVIDER`、`MISTRAL_API_KEY` / `GEMINI_API_KEY`;未設則 `none`(零行為變更,只是把圖存起來)。
- rollback:converter 回傳新欄位可被舊 api 忽略;OCR 關掉即回到「只存圖不抽文字」。

## Open Questions

- OCR 對流程圖/圖表要「抽字」還是「描述」?→ 由 provider prompt 決定,預設請它同時轉錄文字並簡述結構。
- 是否對所有抽出的圖都 OCR,或用啟發式(尺寸/長寬比)只挑「像圖表」的?→ 先全做 + 上限,啟發式列為後續優化。
- OCR 文字放 asset.content 併入 parent chunks,或獨立 chunk 標記來源頁?→ 傾向併入 parent 頁的 chunk 以維持搜尋定位。
