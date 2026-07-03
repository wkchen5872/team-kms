## 1. shared/references — 副檔名錨定多筆解析

- [x] 1.1 新增 `parseCitations(raw): Array<[string, number|null]>`:前處理(去 `*`、`[text](url)`→text)後,以副檔名錨定 regex 掃出所有 token,每筆去前導分隔字元、抓 `, p.N`;無 match 退回 `[[trimmed, null]]`
- [x] 1.2 `parseCitationFilename` 改為 `parseCitations(raw)[0] ?? [trimmed, null]`(維持既有 signature 與測試)
- [x] 1.3 `extractReferences` footnote 迴圈改用 `parseCitations`,逐筆 `add(target, "cites", page)`
  - 測試要求(references.test.ts,用真實字串):
    - `2025 - 台糖 - 台中市北屯區陳平段.md` → 檔名不截斷
    - `A契約書.doc；B契約書.doc` → 兩筆
    - `A.pdf, p.3；B.pdf, p.5` → 兩筆各帶頁碼 3 / 5
    - `report.pdf — 詳見附錄` → `report.pdf` 無頁碼
    - `2501.12948v2-2.pdf, p.5` → 既有行為不變(回歸)
    - 無副檔名字串 → 退回整串單筆

## 2. shared/vaultfs — 全 KB 引用重算

- [x] 2.1 新增 `rebuildReferences(kbId): Promise<{ pages: number; edges: number }>`:`listDocuments` → `buildLookupMaps` 一次 → 每個 wiki 頁 `extractReferences` → `deleteReferences` + 逐邊 `upsertReference`
  - 測試要求(vaultfs.test.ts 或 app.test.ts):建含失敗引用的頁 → 重算後對應邊出現

## 3. apps/api — 觸發端點

- [x] 3.1 `POST /v1/knowledge-bases/:slug/rebuild-references`:`resolveKb`(404 若無/非本人)→ `rebuildReferences` → 回 `{ pages, edges }`
  - 測試要求(app.test.ts):建 KB + 頁 → POST → 200 且 edges > 0;非本人 slug → 404

## 4. 回填既有資料 + 驗證

- [x] 4.1 對松霖 KB(slug=`kb`)觸發一次重算,確認先前約 198 筆 uncited 大幅下降(以 `search mode=references query=uncited` 或 DB 查 `document_references` 邊數前後對照)
- [x] 4.2 `pnpm -r test` 綠;`pnpm --filter @team-kms/web exec tsc --noEmit` 不受影響(本次不動 web)
- [x] 4.3 docs:`docs/architecture/modules/shared.md` / `api-server.md` 補 `rebuildReferences` 與 rebuild 端點;`workflows.md` 引用流程補「副檔名錨定 + 多來源」說明(視內容相關性)
