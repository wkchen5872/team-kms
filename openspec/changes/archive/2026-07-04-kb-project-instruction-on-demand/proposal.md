## Why

目前 KB 的整理慣例(project prompt)只能透過 `guide(knowledge_base=slug)` 疊加取得，這在實際使用上有三個問題:(1) `guide` 是開場的 onboarding 呼叫，此時還不知道要整理哪個 KB，慣例載入時機錯位;(2) 若 `guide` 未帶 slug，下一句才指定 KB 時，慣例就沒機會載入而被漏掉;(3) 把慣例綁在 `guide` 上意味著每次拿慣例都要連 155 行方法論一起重送。當 KB 數量成長到數十個、每份慣例 500–1000 字時，「`guide` 全載所有慣例」會炸掉 token，而「靠 LLM 自覺再叫一次 `guide(slug)`」又不可靠。

## What Changes

- **BREAKING**（對 `guide` 行為）: `guide` 不再接受 `knowledge_base` 參數、不再疊加任何 KB 的 project prompt。`guide()` 只回傳全域方法論 + KB 清單。
- 新增 MCP 工具 `get_project_instruction(knowledge_base)`: 只回傳指定 KB 的 project prompt（精簡、按需、單一 KB），不含方法論、不含清單。KB 無 project prompt 時回傳明確的「無專屬慣例」訊息。
- `guide.md` 的 workflow 段落新增一條規則: 「整理任何 KB 前，先呼叫 `get_project_instruction(該 KB)` 載入該庫慣例」，讓此規則於開場即進入 context。
- `guide` / `list_knowledge_bases` 清單維持標記哪些 KB 有專屬慣例（訊號），與 workflow 規則搭配。
- **不動** DB schema、`project_prompt` 儲存、Web 編輯、API `PATCH`、ingest / 抽取流程——只改「慣例如何遞送給 Claude」。

## Capabilities

### New Capabilities
- `kb-project-instruction`: KB 專屬整理慣例改以獨立、按需的 MCP 工具 `get_project_instruction(slug)` 遞送，並在 `guide.md` workflow 與 KB 清單標記中提供「整理前先查慣例」的指引，取代原先綁在 `guide` 上的疊加機制，以在 KB 數量成長時控制 token 且降低漏載風險。

### Modified Capabilities
（無既有 live spec 檔;`kb-project-prompt` 已歸檔，其中「guide 疊加 project prompt」的行為由本變更以新 capability 取代。）

## Impact

- **apps/mcp** `server.ts`: 移除 `guide` 的 `knowledge_base` 參數與 inputSchema;新增 `get_project_instruction` 工具註冊（description 引導 Claude「整理該 KB 前呼叫」）。
- **apps/mcp** `tools.ts`: `guide()` 拿掉 slug 分支，改為只回 `GUIDE_TEXT + list`;新增 `getProjectInstruction(fs, slug)` 只回該 KB 的 `project_prompt`（找不到 KB / 無慣例各有明確訊息）。
- **prompts/guide.md**: workflow 段落補一條「整理前先 `get_project_instruction`」規則。
- **不影響**: DB migration、`vaultfs.ts` 讀取（`project_prompt` 已在 SELECT 內）、apps/api、apps/web、ingest pipeline。
