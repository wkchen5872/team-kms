## 1. Converter: image extraction (spec: image-asset-ingestion)

- [x] 1.1 Red test for embedded-image parsing (unit test in `markdown.test.ts` with synthetic opendataloader JSON — deterministic, no JVM; live `extract.test.ts` still asserts `images: []` for text PDFs)
- [x] 1.2 `extract.ts`: pass `imageOutput: "embedded"` to opendataloader; `extractPages` returns `{pages, warnings}`
- [x] 1.3 `markdown.ts`: data-URI images pulled into `pages[].images = [{id, dataBase64, format}]`, content emits `![image](odl-image:<id>)` token (external refs untouched)
- [x] 1.4 `index.ts` `/extract`: response `{ pages:[{page,content,images}], page_count, warnings? }`; per-image size + per-page count caps via `MAX_IMAGE_BYTES`/`MAX_IMAGES_PER_PAGE`, no silent truncation
- [x] 1.5 Converter suite green (22 tests incl. live opendataloader + LibreOffice)

## 2. Shared: asset + elements persistence (spec: image-asset-ingestion)

- [x] 2.1 Test: `finalizeExtractedDocument` with images writes `document_pages.elements` + creates `kind='asset'` child docs + `loadAssetBytes` returns bytes (ingest.test.ts, live DB/S3)
- [x] 2.2 `vaultfs.ts`: `persistPageImages` helper — asset doc (`kind='asset'`, `metadata.hidden`, `parent_document_id`, `file_hash` dedup) + upload bytes to Storage `{user}/{assetDocId}/source.{fmt}`
- [x] 2.3 `vaultfs.ts`: `finalizeExtractedDocument` writes `elements` JSON and rewrites `odl-image:<id>` → `asset:<assetDocId>`
- [x] 2.4 Reused existing `loadAssetBytes(assetDocId)` (already ported); added `finalizeImageDocument` for direct uploads
- [x] 2.5 Shared suite green (45 tests)

## 3. API ingest: wire images + direct upload branch (spec: image-asset-ingestion)

- [x] 3.1 Test: uploading a `.png` converges to `ready`, is a visible non-asset source doc, no converter call (ingest.test.ts)
- [x] 3.2 `converter-client.ts`: `PageContent` now carries `images: PageImage[]` (flows to finalize)
- [x] 3.3 `ingest.ts`: `IMAGE_TYPES` branch — store raster image, skip converter, `finalizeImageDocument` → ready
- [x] 3.4 `ingest.ts` PDF path + `jobs.ts` pass `pages[].images` through; `jobs.ts` also image-guards recovery
- [x] 3.5 api suite green (15 tests)

## 4. OCR: pluggable multi-provider (spec: image-ocr)

- [x] 4.1 Tests: `ocrProviderFromEnv` selection (`none`/missing-key → null, mistral/gemini when keyed) — ocr.test.ts
- [x] 4.2 `apps/api/src/ocr.ts`: `OcrProvider` interface + `MistralProvider` + `GeminiProvider` (response normalization) + env factory
- [x] 4.3 Ingest: `ocrPageImages`/`ocrImageBytes` fill `ExtractedImage.ocrText`; vaultfs stores it on asset content + appends to page for chunks; direct image → `finalizeImageDocument(content+chunks)`
- [x] 4.4 OCR text flows into chunks (asset content + page append / image-doc content) → searchable via existing `searchChunks`
- [x] 4.5 Graceful degradation tested: provider throw / non-2xx → `ocrImageBytes` returns undefined, ingest never fails
- [x] 4.6 Response normalization covered by stubbed-fetch unit tests (Mistral + Gemini); no live external calls (keyless CI)

## 5. MCP read include_images (spec: mcp-image-read)

- [x] 5.1 Test: `read(include_images=true)` returns image blocks; default text-only (tools.test.ts, live DB/S3)
- [x] 5.2 `server.ts`: `include_images` param on read tool schema + combined text/image content result
- [x] 5.3 `tools.ts`: `readImages` loads asset bytes (raster doc + page `elements.images`), base64, cap 12 with indicator
- [x] 5.4 mcp suite green (18 tests)

## 6. Web display (spec: image-asset-ingestion)

- [x] 6.1 `WikiContent` image resolver handles `asset:<docId>` → `/source-url`; directly-uploaded images render via existing FilesGrid `ImageViewer`. Web tsc green.

## 7. Docs + verification

- [x] 7.1 Updated `docs/architecture/modules/{converter,api-server,web}.md` for the image/OCR pipeline
- [x] 7.2 Full workspace `tsc` clean + all suites green (shared 45, converter 22, mcp 18, api 23 = 108)
- [x] 7.3 Manual E2E verified by user: image upload → raw doc + OCR; PDF table now extracts fully.

## 8. Fixes surfaced during e2e (apply-phase)

- [x] 8.1 opendataloader embedded-image field is `data` (+ `format`), not `source` — `markdown.ts` corrected; live image-PDF regression test added (`makeImagePdf`)
- [x] 8.2 **Table extraction**: opendataloader emits tables as `table` (rows→cells→paragraphs) which were dropped (`default → ""`); added `tableToMarkdown` → GFM table + unit test
- [x] 8.3 Converter hard timeout (`EXTRACT_TIMEOUT_MS`) so a hung opendataloader run can't wedge the `active`-slot counter at capacity
- [x] 8.4 TUS uploads now go through the async job queue (`ingestAsync` + `enqueue`) instead of synchronous ingest — no converter saturation / stuck-pending on failure
- [x] 8.5 Upload hints: per-upload toast tracks uploading → processing → ready/failed (store-driven)
- [x] 8.6 `.env.example`: `OCR_PROVIDER`/`MISTRAL_API_KEY`/`GEMINI_API_KEY`/`GEMINI_MODEL` + `MAX_IMAGE_BYTES`/`MAX_IMAGES_PER_PAGE`
