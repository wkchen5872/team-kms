## Context

`documents` 是「原始檔(raw) / wiki 稿 / asset」三種文件的統一表。統一表是刻意的設計——
`document_references`(引用圖譜)、`document_chunks`(搜尋)、`document_pages` 全部 FK 到 `documents`
的單一 id 空間，讓「wiki 頁引用來源檔」這種跨類關聯得以成立。**本次不動這個統一 id 空間。**

問題在於「kind」的編碼：本專案移植自 upstream 的 postgres 路徑，該路徑用 `path` + 一堆
`metadata->>'...'` JSONB flag 拼湊分類；而 upstream 的 sqlite 路徑其實有乾淨的 `source_kind` 欄位
（`CHECK IN ('wiki','source','asset')` + index）。兩套 schema 版本漂移，我們繼承了髒的一半，導致
維護困惑與 metadata 過載。

## Goals / Non-Goals

**Goals:**
- 用正式 `kind` 欄取代 JSONB flag，恢復 upstream sqlite 的乾淨分類模型。
- 把 raw 專屬的處理紀錄欄移出 base，維護時不再面對「這欄為什麼空」。
- 提供上傳去重，避免同檔重複佔用 S3 與解析資源。
- 保持統一 id 空間、對外 API 零破壞、遷移對既有 103 筆零資料損失。

**Non-Goals:**
- 不整理 `metadata` JSONB（`description` / `parent_document_id` 提升）——等 OCR/抽圖有實例。
- 不建 `document_wiki` 子表（date/tags 留 base）——與 metadata 那輪一起做，否則 description 半套。
- 不做 PDF/office 抽圖 + 圖片 OCR——讀取端 plumbing 已在，抽取端另開 change。
- 不做 public 唯讀分享（upstream 006）——刻意不做。
- 不把統一 `documents` 拆成兩張獨立表——會弄壞 `document_references` 的 FK（polymorphic FK）。

## Decisions

### D1. 用 base + `document_raw` 的 CTI，而非「兩張獨立表」或「純 View」
- **選擇**：保留統一 `documents` base（id 空間、references/chunks/pages FK 不變），只把 raw 專屬欄
  抽到 `document_raw` 1:1 子表。
- **為何不「兩張獨立表」**：`document_references.target_document_id` 需能同時指向 raw 與 wiki，
  一個 FK 無法參照兩張表（polymorphic FK）。CTI 保留 base 就避開了。
- **為何不「只做 View」**：View 解決「讀的可讀性」但不減少實體欄位；使用者要的是實體層也乾淨
  （raw 那筆實體上就不該有 wiki/處理欄）。View 仍照做，作為輔助。
- **範圍**：本次只拆 `document_raw`（`parser`、`error_message`、`page_count`）。`file_size`（已對
  wiki 也計算，非 raw 專屬）、`status`（生命週期，多處查詢）留 base。`document_wiki` 延後。

### D2. `kind` 是明確寫入的欄位，不是 generated column
- **選擇**：`kind TEXT NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw','wiki','asset'))` + index，由寫入
  層明確指派。
- **為何不用 generated-from-path**：`raw`/`wiki` 可由 `path` 衍生，但 `asset` 來自「Claude 產的是
  svg/csv」而非 path，無法純衍生。統一用明確寫入較一致。
- **asset 接上**：把 `listDocuments` 的 `metadata->>'asset'` 濾網改為 `kind <> 'asset'`；`create`
  對 svg/csv 設 `kind='asset'`。等於把「有濾網、沒人餵值」的半殘功能接起來。

### D3. 去重用 `file_hash`（原始 bytes），不是 upstream 的 `content_hash`
- **選擇**：`file_hash` = 原始上傳 bytes 的 sha256，ingest 時（解析前）計算。
- **為何不用 content_hash**：upstream 的 `content_hash` 是「抽取後內容」的雜湊，服務於它 local 模式
  的**檔案變更偵測**（決定是否重新索引），與我們「hosted 上傳去重」目的不同。file_hash 精準、可在
  解析前算出、直接擋「同一份檔上傳兩次」。
- **範圍**：去重以「同一知識庫 + 相同 file_hash + 未 archived」為條件；跨 KB 相同 bytes 不算重複。

### D4. 遷移採 forward-only 時間戳 migration，回填以 path/既有值為準
- 4 支 migration（時間戳命名，附 `grant to service_role` + RLS，依專案規範）。
- kind 回填：`path LIKE '/wiki/%'` → `wiki`，其餘 → `raw`（含 40 張 failed 圖，它們是上傳來源）。
- `file_hash` 既有列不回填（原始 bytes 在 S3，可選重算；預設 NULL，僅新上傳生效）。

## Risks / Trade-offs

- [雙寫一致性：raw 文件要同時寫 base + `document_raw`] → 兩者放同一交易（`createDocument` /
  `finalizeExtractedDocument` 已是交易），並靠 `ON DELETE CASCADE` 顧刪除；讀取 raw 欄以 join 取得。
- [讀取多一個 JOIN（列表需 raw 欄時）] → 可接受；`listDocuments` 已是單次查詢，改為 LEFT JOIN
  `document_raw`，量級小。
- [遷移動到既有 103 筆 live 資料] → forward-only + 先回填再 drop 欄；migration 後以 count 與 kind
  分佈驗證；本機 DB 先跑 `supabase migration up` 驗證無 drift。
- [`kind` 需寫入層每個 call site 正確指派] → 收斂在 `vaultfs` 的 create/finalize 與 ingest/create
  少數入口；新增測試斷言各入口 kind 正確。
- [去重誤判：不同檔剛好同 hash] → sha256 碰撞機率可忽略；且以 KB 範圍限定，影響面小。

## Migration Plan

1. **加 `kind`**：add column（nullable 起步）→ 回填（path 判定）→ set `NOT NULL` + `CHECK` + index。
2. **加 `file_hash`**：add column + index（既有列留 NULL）。
3. **建 `document_raw`**：建表 → 從既有 raw 文件搬 `parser`/`error_message`/`page_count` → base 上
   `DROP COLUMN` 這幾欄。
4. **建 views**：`sources` / `wiki_pages`。
- 每支套用後以 `supabase migration up` + `migration list` 確認無 drift；資料以 count/kind 分佈驗證。
- **Rollback**：因是 forward-only，回退以補償 migration 處理（drop view / 欄位搬回 / drop kind），
  但本機 dev 亦可由備份或重放評估。

## Open Questions

- `page_count` 是否確定移入 `document_raw`（它是 raw 屬性但非「pipeline log」）？預設移入，
  實作時若造成過多 join 再評估留 base。
- `sources` / `wiki_pages` view 的欄位投影清單以實作時的實際查詢需求為準。
