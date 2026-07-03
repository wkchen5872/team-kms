## ADDED Requirements

### Requirement: 每個知識庫可儲存專屬 project prompt

系統 SHALL 允許每個 knowledge base 儲存一段可選的自由文字 project prompt(整理偏好)。此欄位 SHALL 為 nullable,未設定時視為無疊加。系統 SHALL 對 project prompt 施加長度上限,超過上限的寫入 SHALL 被拒絕。project prompt SHALL 儲存於 server 端,並在同一 KB 的所有團隊成員之間共用。

#### Scenario: 設定並保存 project prompt

- **WHEN** 使用者在某 KB 的設定送出一段 project prompt 文字
- **THEN** 系統保存該文字,之後讀取該 KB 時回傳相同內容

#### Scenario: 清空 project prompt

- **WHEN** 使用者將某 KB 的 project prompt 清空後儲存
- **THEN** 系統將該 KB 視為無 project prompt(不再疊加)

#### Scenario: 超過長度上限被拒絕

- **WHEN** 使用者送出超過長度上限的 project prompt
- **THEN** 系統拒絕該次寫入並回傳錯誤,原有內容不變

### Requirement: guide 疊加 KB project prompt

MCP `guide` 工具 SHALL 接受可選的 `knowledge_base` 參數。當帶入有效 slug 且該 KB 有非空 project prompt 時,`guide` SHALL 回傳全域 guide 內容,並在其後附上該 KB 的 project prompt(以清楚標示的區塊)。當未帶 slug、或該 KB 無 project prompt 時,`guide` SHALL 回傳與現狀相同的全域內容(無疊加)。

#### Scenario: 帶 slug 且有 project prompt

- **WHEN** Claude 呼叫 `guide(knowledge_base="acme")` 且該 KB 設有 project prompt
- **THEN** 回傳內容同時包含全域 guide 與該 KB 的 project prompt 疊加區塊

#### Scenario: 帶 slug 但無 project prompt

- **WHEN** Claude 呼叫 `guide(knowledge_base="acme")` 且該 KB 未設 project prompt
- **THEN** 回傳內容等同不帶 slug 的全域 guide(無疊加區塊)

#### Scenario: 不帶 slug 維持現狀

- **WHEN** Claude 呼叫 `guide()` 不帶任何 knowledge_base
- **THEN** 回傳全域 guide,行為與本變更前一致

### Requirement: 有慣例的 KB 於清單標記

當某 KB 設有 project prompt 時,`guide` 與 `list_knowledge_bases` 產生的知識庫清單 SHALL 為該 KB 標記其擁有專屬整理慣例,以提示 Claude 於處理該 KB 前先呼叫 `guide(該 slug)`。

#### Scenario: 清單標記有慣例的 KB

- **WHEN** 某 KB 設有 project prompt,Claude 呼叫 `list_knowledge_bases` 或 `guide()`
- **THEN** 該 KB 在清單中被標示為擁有專屬整理慣例
