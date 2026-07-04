## 1. tools.ts — get_project_instruction + guide 簡化

- [x] 1.1 (Red) 在 `apps/mcp/src/tools.test.ts` 加測試：`getProjectInstruction` 對「有慣例 KB」只回該 KB 的 project prompt（不含方法論/清單）、對「無慣例 KB」回明確訊息、對「不存在 slug」回找不到訊息
- [x] 1.2 (Red) 加測試：`guide()`（無參數）回傳含方法論與清單、且**不含**任何 project prompt 疊加區塊
- [x] 1.3 (Green) 新增 `export async function getProjectInstruction(fs, slug)`：查 `listKnowledgeBases`，比對 slug/id，回三種訊息（有慣例 / 無慣例 / 找不到）
- [x] 1.4 (Green) `guide(fs)` 移除 `slug` 參數與 project prompt 疊加分支，改為只回 `GUIDE_TEXT + list`
- [x] 1.5 保留 `kbLine` 的「has project conventions」標記，僅將提示語從「call `guide` with this slug」改為「call `get_project_instruction` with this slug」
- [x] 1.6 執行 `npm test`（mcp 套件），1.1–1.2 測試全綠

## 2. server.ts — 工具註冊

- [x] 2.1 (Green) 註冊 `get_project_instruction` 工具：`inputSchema { knowledge_base: z.string() }`，description 引導 Claude「整理某 KB 前先呼叫以載入該庫慣例」，handler 回 `text(await getProjectInstruction(fs, knowledge_base))`
- [x] 2.2 (Green) 移除 `guide` 註冊中的 `knowledge_base` inputSchema 與 handler 的 slug 傳遞；更新 `guide` description 移除「Pass a slug to also get project conventions」句
- [x] 2.3 (若有) 更新 `http.test.ts` / `server` 相關測試以反映工具清單變動

## 3. guide.md — workflow 指引

- [x] 3.1 在 `prompts/guide.md` 的 workflow 段新增一條：「整理任何 KB 前，先 `get_project_instruction(該 KB)` 載入該庫的專屬整理慣例」
- [x] 3.2 檢查 `prompts/guide.md` 內文若有提及 `guide(slug)` 取得慣例的舊描述，一併更新為指向 `get_project_instruction`

## 4. 驗收

- [x] 4.1 `npm test` 全套通過（mcp 套件）
- [x] 4.2 手動確認：`guide()` 輸出不含 project prompt；`get_project_instruction("kb")` 只回該 KB 慣例
