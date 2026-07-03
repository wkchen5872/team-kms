## Why

不同 knowledge base 丟進來的內容領域差異很大(技術 / 醫療 / 財務…),但整理 wiki 的「預設 prompt」(`prompts/guide.md`)是全域單一版本。團隊希望**每個 KB 能約定自己的整理偏好**(例如:entities 需附財務或 timeline 資料、財務類 concepts 多用圖表整理),且因為這個 MCP 是團隊共同編輯,約定必須存在 server 端、大家共用,而不是每個人在自己電腦的 Claude 各自加要求。

## What Changes

- `knowledge_bases` 新增一個 **project prompt** 欄位(每 KB 一段自由文字的整理偏好)。
- MCP `guide` 工具支援可選的 `knowledge_base` 參數:帶 slug 時,回傳「全域 `guide.md` + 該 KB 的 project prompt overlay」;不帶時維持現狀。
- `guide` / `list_knowledge_bases` 的 KB 清單標記哪些 KB 有專屬整理慣例,提示 Claude 開始處理該 KB 前先 `guide(slug)`。
- Web 端在該 KB 的設定(WikiSelector 選單 → 設定對話框)提供一塊 textarea 編輯 project prompt,團隊共同維護。
- API `PATCH /v1/knowledge-bases/:slug` 擴充接受 `project_prompt`;KB 清單回傳帶上 `project_prompt` 供前端載入。
- **不動 ingest / 抽取流程**——只影響 Claude 撰寫 wiki 的偏好。

## Capabilities

### New Capabilities
- `kb-project-prompt`: 每個知識庫可設定專屬的 wiki 整理偏好(project prompt),透過 MCP `guide` 疊加到全域 prompt 之上,並由團隊在 Web 端共同編輯。

### Modified Capabilities
（無既有 spec 檔;以新 capability 描述）

## Impact

- **DB**:新增 migration `ALTER TABLE knowledge_bases ADD COLUMN project_prompt text`(既有表加欄位,nullable,無需補 GRANT/RLS——欄位沿用該表既有授權)。
- **packages/shared** `vaultfs.ts`:`resolveKb` / `listKnowledgeBases` 的 SELECT 帶回 `project_prompt`;新增 `updateKnowledgeBasePrompt`(service-role,scoped by user_id)。
- **apps/mcp** `server.ts` / `tools.ts`:`guide` 加可選 `knowledge_base` 參數 + overlay 組裝;清單標記有慣例的 KB。
- **apps/api** `index.ts`:`PATCH /knowledge-bases/:slug` 接受 `project_prompt`(長度上限,超過回 400)。
- **apps/web**:KB 設定對話框 + `useKBStore` 更新方法 + `KnowledgeBase` 型別加 `project_prompt`。
- 不影響 ingest pipeline、converter、既有抽取行為。
