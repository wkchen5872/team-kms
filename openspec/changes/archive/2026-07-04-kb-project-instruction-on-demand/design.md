## Context

前一個變更 `kb-project-prompt`（已歸檔）把 KB 專屬整理慣例綁在 `guide(knowledge_base=slug)` 上疊加取得。實測發現，慣例的載入被綁在「錯的時機」（`guide` 是開場 onboarding 呼叫，此時尚未決定要整理哪個 KB）與「昂貴的載體」（每次拿慣例都連 155 行方法論一起重送）。而 KB 的識別在真實使用中是「下一句口語指名」（如「整理松霖」）才發生。當 KB 成長到數十個、每份慣例 500–1000 字，這個設計會在「全載」與「漏載」之間兩難。

`project_prompt` 欄位、Web 編輯、API、`vaultfs` 讀取皆已存在且不需改動——本變更只重新設計「慣例如何遞送給 Claude」。

## Goals / Non-Goals

**Goals:**
- 讓 Claude 在「選定 KB 那刻」按需載入「單一」KB 的慣例，token 成本不隨 KB 總數成長。
- 降低慣例被漏載的機率，靠「開場即在 context 的 workflow 規則 + 每 KB 的清單訊號」而非結構強制。
- 保持 `guide` 職責單純（方法論 + 清單），與 `list_knowledge_bases` 的精簡查詢模式對稱。

**Non-Goals:**
- 不做 `resolve_kb` / server 端模糊比對——口語名 → slug 的匹配交給 LLM（其強項），slug 維持在清單中可見。
- 不藏 slug、不加 `aliases` 欄位、不做結構性強制載入。
- 不改 DB schema、`project_prompt` 儲存、Web、API、ingest / 抽取流程。

## Decisions

**決策 1：新增精簡工具 `get_project_instruction(slug)`，而非重用 `guide(slug)`。**
`guide(slug)` 雖能回慣例，但會連方法論一起重送（~1.5k token 浪費）。獨立精簡工具只回單一 KB 的慣例（~750 token），與 `list_knowledge_bases` 對 `guide` 清單的關係同構（精簡、單一職責、按需）。
- 替代方案：保留 `guide(slug)` 疊加。否決——時機錯位與重送浪費是本變更要解的核心。

**決策 2：靠「指引」而非「結構強制」確保載入。**
在 `guide.md` workflow 放「規則」（整理前先查慣例），在 KB 清單放「訊號」（哪些 KB 有慣例）。規則因 `guide` 開場必被呼叫而恆在 context;訊號讓 Claude 知道「這個 KB 具體需要」。
- 替代方案：藏 slug、逼「name→slug 解析」成唯一出口以搭載慣例（結構強制）。否決——需一整套重設計（resolve tool、清單改造、可能加欄位），成本遠高於 pull 指引，且 LLM 模糊比對本就可靠。

**決策 3：`guide` 移除 `knowledge_base` 參數（對 `guide` 為 BREAKING）。**
慣例既全數改由新工具遞送，`guide` 的 slug 分支即為死碼。移除以維持 `guide` 職責單純、避免兩條路徑遞送同一資料。

## Risks / Trade-offs

- [Claude 可能仍漏叫 `get_project_instruction`] → workflow 規則（恆在）+ 清單訊號（標記有慣例的 KB）雙重提示;此為 pull 架構可達的最高可靠度，若日後觀察到仍常漏，再評估結構強制。
- [口語名對到錯的 slug（如未來出現相近名稱）] → slug 維持在清單可見，交由 LLM 比對;KB 名稱衝突屬另一問題，非本變更範圍。
- [移除 `guide` 的 slug 參數是 BREAKING] → 影響面僅限本 repo 的 MCP client（Claude 透過 description 使用），無外部契約消費者;歸檔的 `kb-project-prompt` spec 對應行為由本變更取代。

## Migration Plan

1. `tools.ts`: 新增 `getProjectInstruction(fs, slug)`;`guide()` 移除 slug 分支。
2. `server.ts`: 註冊 `get_project_instruction` 工具（description 引導「整理該 KB 前呼叫」）;移除 `guide` 的 `knowledge_base` inputSchema。
3. `prompts/guide.md`: workflow 段補一條前置查詢規則。
4. 更新 / 新增對應測試（`tools.test.ts`）。
無資料遷移;回滾僅需還原上述程式碼變更。

## Open Questions

- 無。（`list_knowledge_bases` 是否保留為「只看不動」入口屬既有設計，非本變更決策。）
