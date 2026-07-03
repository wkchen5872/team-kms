## Why

真實 KB(松霖國際)的 wiki 引用大量解析失敗,造成來源被誤判為「未引用」(uncited)、知識圖譜少邊。根因在 `packages/shared/src/references.ts` 的 citation 解析:

1. **` - `(空白-連字號-空白)截斷**:`parseCitationFilename` 用 `split(/\s+[-–—]\s+/)[0]` 想砍掉檔名尾巴的人工註解,但該 KB 命名慣例是「年 - 公司 - 主題.md」,結構性使用 ` - `,於是檔名被砍到只剩 `2025` / `2026-04-27` → 完全比對不到。這是**最主要**的破壞來源。
2. **複合 footnote 不支援**:一個 `[^N]:` 只解析成一筆來源;`A.doc；B.doc` 這種多來源(全形 `；`)只認第一筆、甚至(無頁碼時)整筆失效。

## What Changes

- 重寫 citation 檔名解析:改用 **副檔名錨定**——在 footnote 值裡掃出所有 `…….<副檔名>` token,每個 token 視為一筆引用,並就地抓其後的 `, p.N` 頁碼。
  - ` - ` 不再被當分隔符切掉檔名(檔名原樣保留)。
  - 一個 footnote 內多來源(以 `；;、,` 或空白分隔的多個 `.ext` token)全部拆成獨立引用。
  - 檔名後的純文字註解(如 `report.pdf — 詳見附錄`)仍會被忽略(錨定到副檔名即停)。
  - 無副檔名的引用退回原字串比對(維持既有 title/base 比對能力)。
- 新增**全 KB 引用重算**能力:對某 KB 的所有 wiki 頁重跑引用抽取並回填 `document_references`,讓既有頁面套用新 parser(否則舊頁要逐一編輯才會更新)。
- 提供觸發重算的 API 端點(供修正後回填既有資料)。

## Capabilities

### New Capabilities
- `citation-parsing`: wiki footnote 引用的檔名/頁碼解析規則(副檔名錨定、多來源、` - ` 安全)與全 KB 引用重算。

### Modified Capabilities
（無既有 spec 檔;以新 capability 描述）

## Impact

- **packages/shared** `references.ts`:重寫 `parseCitationFilename`(改為多筆抽取,保留單筆 wrapper 相容既有呼叫/測試);`extractReferences` footnote 迴圈改用多筆結果。
- **packages/shared** `vaultfs.ts`:新增 `rebuildReferences(kbId)`——列出 wiki 頁、逐頁 `extractReferences` → `deleteReferences` + `upsertReference`。
- **apps/api** `index.ts`:新增 `POST /v1/knowledge-bases/:slug/rebuild-references`。
- 測試:`references.test.ts` 補真實字串案例。
- 不改 DB schema、不改 ingest、不改 MCP 工具介面(MCP 寫入自動吃到新 parser)。
