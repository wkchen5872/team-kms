---
type: Architecture
title: 模組解析：apps/converter
description: apps/converter 文件轉換微服務的支援格式、解析管線、核心檔案與依賴。
tags: [architecture, module, converter]
timestamp: 2025-07-02T00:00:00Z
---

# 模組解析：apps/converter

[← 返回索引](/docs/architecture.md) · [模組地圖](/docs/architecture/module-map.md)

## 職責

`apps/converter` 是一個無狀態的文件轉換微服務：接收來源檔案的 URL，輸出 per-page
markdown。這是原 Python `llmwiki` converter 的**全 Node 重寫**——已查證
`opendataloader-pdf` 是 Java CLI 的薄包裝，`@opendataloader/pdf` npm 套件直接呼叫
同一個 Java 引擎，因此轉換品質與原版一致，零損失。

## 支援格式與解析路徑

副檔名決定走幾段管線（判斷在 `index.ts`：`OFFICE_EXTENSIONS.has(ext) ? officeToPdf(...) : sourcePath`）：

| 副檔名 | 路徑 | 說明 |
|---|---|---|
| `pdf` | ② opendataloader | 直接 PDF → per-page markdown |
| `doc` `docx` `ppt` `pptx` `xls` `xlsx` | ① LibreOffice → PDF → ② opendataloader | Office/Excel **先用 LibreOffice 轉 PDF**，再交給 opendataloader 抽 markdown |
| 其他（含 `csv`） | ✗ 不支援 | 不在 `SUPPORTED` 清單，`/extract` 回 400；CSV 由 web 端 `ContentViewer` 直接呈現 raw，不進本服務 |

```
Office/Excel ─①─ LibreOffice(soffice --convert-to pdf) ─→ PDF ─┐
                                                                ├─②─ opendataloader ─→ per-page markdown
PDF ────────────────────────────────────────────────────────────┘
```

## 核心檔案

### `index.ts` — 服務入口
- Hono app，單一端點 `POST /extract`。
- 認證：`CONVERTER_SECRET` bearer token，使用 timing-safe 比較防時序攻擊。
- 併發上限：`MAX_CONCURRENT_EXTRACTIONS`（環境變數，預設 2）。
- 呼叫前先經 `validateSourceUrl()`（SSRF 防護）。
- 轉換管線：下載來源 → （若為 Office 檔）LibreOffice 轉 PDF → opendataloader 解析 →
  組裝逐頁 markdown + 內嵌圖 bytes。
- 回傳：`{ pages: [{page, content, images}], page_count, warnings?, request_id? }`，
  `images = {id, dataBase64, format}[]`。圖片 bytes 只抽取回傳，**存 asset 與 OCR 由
  `apps/api` ingest 層負責**（converter 保持無狀態、零 LLM）。
- 每次轉換使用獨立暫存目錄，完成後 `rm -rf` 清理。

### `extract.ts` — PDF → markdown + 內嵌圖
- `extractPages(pdfPath, opts?)`：呼叫 opendataloader `convert()` 時帶
  **`imageOutput: "embedded"`**（否則預設 `external`，圖會寫進隨即被刪的暫存目錄 → 死連結），
  讓圖以 base64 data URI 內嵌 JSON；解析後交給 `assemblePages()`。回傳 `{pages, warnings}`。

### `office.ts` — Office → PDF
- `officeToPdf(sourcePath, tmpDir)`：以子行程呼叫 LibreOffice 二進位
  （環境變數 `LIBREOFFICE_BIN`，Docker 內預設 `libreoffice`，macOS 上需設為 `soffice`）。
- 每次轉換使用獨立 user profile 目錄，避免 LibreOffice 行程鎖競爭。
- Timeout 120 秒；逾時會 kill 整個 process group（LibreOffice 會衍生 JVM 子行程）。

### `markdown.ts` — opendataloader JSON → markdown
- `elementToMarkdown(el)`：把 opendataloader 的元素（heading/paragraph/list/image/caption）
  轉為對應的 markdown 語法。
- `assemblePages(data, opts?)`：依 `page_number` 分組，過濾頁首/頁尾雜訊，上限 10,000 頁；
  data-URI 圖片抽成 `pages[].images`，content 內留 `![image](odl-image:<id>)` token 供 ingest 改寫；
  另有每圖大小 / 每頁張數上限（`MAX_IMAGE_BYTES` / `MAX_IMAGES_PER_PAGE`），超過則跳過並回 `warnings`。

### `download.ts`
- `downloadToFile(url, dest, maxBytes)`：串流下載並限制檔案大小上限，避免記憶體/磁碟被大檔撐爆。

### `ssrf.ts` — SSRF 防護
- `validateSourceUrl(rawUrl, opts)`：只允許
  - `*.amazonaws.com`（AWS S3）
  - 設定檔中指定的 S3-compatible endpoint（Supabase Storage / MinIO）
  - bucket 驗證：vhost 前綴（`{bucket}.host`）或 path-style（`/{bucket}/...`）
  避免服務被誘導去存取內網位址。

## 依賴關係

- 被 `apps/api` 呼叫（HTTP，`converter-client.ts`）；本身不直連資料庫。
- 依賴 `@opendataloader/pdf`（需要 JVM）與系統的 LibreOffice 二進位。
- Docker 映像需額外安裝 `default-jre-headless` + `libreoffice-writer/impress/calc`；
  根 `Dockerfile`（純 Node）不含這些依賴，因此 converter 有獨立的 `apps/converter/Dockerfile`。

# Citations

[1] [`@opendataloader/pdf` (npm)](https://www.npmjs.com/package/@opendataloader/pdf) — Node wrapper 直接呼叫 opendataloader 的同一個 Java CLI 引擎，佐證「與 Python 原版同一轉換引擎、零品質損失」的聲明。
