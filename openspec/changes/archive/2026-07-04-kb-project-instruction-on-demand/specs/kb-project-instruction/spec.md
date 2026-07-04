## ADDED Requirements

### Requirement: 按需查詢單一 KB 的整理慣例

系統 SHALL 提供 MCP 工具 `get_project_instruction`，接受必填的 `knowledge_base`（slug 或 id）。當該 KB 存在且有非空 project prompt 時，工具 SHALL 只回傳該 KB 的 project prompt 內容（含清楚標示的標題），且 SHALL NOT 包含全域方法論或 KB 清單。當該 KB 無 project prompt 時，工具 SHALL 回傳明確的「該 KB 無專屬整理慣例」訊息。當 slug 找不到對應 KB 時，工具 SHALL 回傳明確的「找不到該 KB」訊息。

#### Scenario: 查詢有慣例的 KB

- **WHEN** Claude 呼叫 `get_project_instruction(knowledge_base="kb")` 且該 KB 設有 project prompt
- **THEN** 回傳只包含該 KB 的 project prompt（含標示標題），不含全域方法論與清單

#### Scenario: 查詢無慣例的 KB

- **WHEN** Claude 呼叫 `get_project_instruction(knowledge_base="kb")` 且該 KB 未設 project prompt
- **THEN** 回傳明確訊息表示該 KB 無專屬整理慣例

#### Scenario: 查詢不存在的 KB

- **WHEN** Claude 呼叫 `get_project_instruction(knowledge_base="nope")` 且無對應 KB
- **THEN** 回傳明確訊息表示找不到該 KB

### Requirement: guide 不再疊加 KB project prompt

MCP `guide` 工具 SHALL NOT 接受 `knowledge_base` 參數，且 SHALL NOT 在其輸出中疊加任何 KB 的 project prompt。`guide` SHALL 只回傳全域方法論與 KB 清單。KB 專屬慣例一律改由 `get_project_instruction` 取得。

#### Scenario: guide 只回全域內容

- **WHEN** Claude 呼叫 `guide()`
- **THEN** 回傳全域方法論與 KB 清單，且不含任何 KB 的 project prompt 疊加區塊

#### Scenario: guide 不接受 knowledge_base 參數

- **WHEN** 檢視 `guide` 工具的 inputSchema
- **THEN** 其中不存在 `knowledge_base` 參數

### Requirement: guide.md 指引「整理前先查慣例」

全域 `guide.md` 的 workflow 段落 SHALL 包含一條規則，指示 Claude 於開始整理任何 KB 前，先呼叫 `get_project_instruction(該 KB)` 載入該庫慣例。此規則因 `guide` 於開場即被呼叫而必然進入 context。

#### Scenario: workflow 含前置查詢規則

- **WHEN** Claude 讀取 `guide()` 回傳的方法論內容
- **THEN** 其 workflow 段落包含「整理某 KB 前先 `get_project_instruction` 該 KB」的指引

### Requirement: 有慣例的 KB 於清單標記（維持）

當某 KB 設有 project prompt 時，`guide` 與 `list_knowledge_bases` 產生的知識庫清單 SHALL 為該 KB 標記其擁有專屬整理慣例，以提示 Claude 於處理該 KB 前先呼叫 `get_project_instruction(該 slug)`。

#### Scenario: 清單標記有慣例的 KB

- **WHEN** 某 KB 設有 project prompt，Claude 呼叫 `list_knowledge_bases` 或 `guide()`
- **THEN** 該 KB 在清單中被標示為擁有專屬整理慣例
