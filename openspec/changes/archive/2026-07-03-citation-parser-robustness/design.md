## Context

`references.ts` 現況(每次 MCP create/edit/append 存檔時,`references-sync.ts` 的 `updateReferences` 重算單頁引用):

```
CITATION_RE = /\[\^\d+\]:\s*(.+)$/gm        每行 [^N]: 抓冒號後整行當「一筆」
parseCitationFilename(raw):
  1. 去頭尾 *
  2. [text](url) → 取 text
  3. s = s.split(/\s+[-–—]\s+/)[0]           ← 破壞點：把結構性 ` - ` 檔名砍半
  4. /,\s*p\.?\s*(\d+)/ 抓頁碼
  5. filenameToDoc.get(lowercase) 精確比對
```

真實資料佐證(松霖 KB):`2025 - 台糖 - …md`、`2026-04-27 - 松霖…md` 被第 3 步砍成 `2025` / `2026-04-27`;`A.doc；B.doc` 複合只認一筆或全失。`EXT_RE` 已定義已知副檔名集合可重用。

## Goals / Non-Goals

**Goals:**
- ` - ` 檔名不再被截斷;多來源 footnote 全部解析;既有失敗資料可回填。

**Non-Goals:**
- 不改 DB schema、不改 ingest、不改 MCP 工具 signature。
- 不處理「檔名本身含逗號」這種極罕見情況(YAGNI)。
- 不做前端重算按鈕(先 API 端點即可;要 UI 再議)。

## Decisions

- **副檔名錨定多筆抽取**:新增 `parseCitations(raw): Array<[filename, page|null]>`。
  - 前處理沿用:去頭尾 `*`、`[text](url)` → text。
  - 掃描 regex(全域、忽略大小寫):`/(.+?\.(?:pdf|docx?|pptx?|xlsx?|csv|html?|md|txt))(?:\s*,\s*p\.?\s*(\d+))?/gi`。
  - 每個 match 的檔名去除**前導**分隔字元/空白(`^[；;、,\s]+`),解決 `matchAll` 讓下一個 token 帶到前面 `；` 的問題。
  - 無 match → 退回 `[[trimmed, null]]`。
- **相容**:保留 `parseCitationFilename(raw)` 為 `parseCitations(raw)[0] ?? [trimmed, null]`,既有呼叫/測試不動。`extractReferences` footnote 迴圈改成對 `parseCitations` 結果逐筆 `add`。
- **重算**:`PostgresVaultFS.rebuildReferences(kbId)` — `listDocuments` → `buildLookupMaps` 一次 → 對每個 wiki 頁 `extractReferences` → `deleteReferences(docId)` + 逐邊 `upsertReference`。回傳 `{ pages, edges }`。全用 shared 既有方法(deleteReferences/upsertReference 已存在)。
- **API**:`POST /v1/knowledge-bases/:slug/rebuild-references` → `resolveKb`(404 若無/非本人)→ `rebuildReferences` → 回 `{ pages, edges }`。

## Risks / Trade-offs

- **lazy `.+?\.ext` 邊界**:對 `2501.12948v2-2.pdf` 這種內含點的檔名,因唯一 `.pdf` 在結尾,lazy 仍取全名(既有測試保住)。多 token 間以「去前導分隔」處理,不用完美切割。
- **前導分隔清理**可能誤删檔名開頭的合法字元?已知副檔名前的檔名極少以 `；;、,` 起頭;風險低。
- **重算成本**:對大 KB 是 O(頁 × 邊) 的 DB 寫入;松霖約 17 頁,可接受。若日後 KB 很大再考慮批次/交易。
- 舊資料只有「觸發重算」後才修好;新寫入即時正確。
