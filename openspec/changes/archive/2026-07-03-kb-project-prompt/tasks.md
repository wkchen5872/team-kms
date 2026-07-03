## 1. DB — project_prompt 欄位

- [x] 1.1 新增 migration `supabase/migrations/<ts>_kb_project_prompt.sql`:`ALTER TABLE knowledge_bases ADD COLUMN project_prompt text;`(既有表加欄位,不補 GRANT/RLS)
  - 測試要求:`supabase db reset` 後欄位存在(手動/既有 schema 驗證即可)

## 2. shared/vaultfs — 讀寫 project_prompt

- [x] 2.1 `resolveKb` 與 `listKnowledgeBases` 的 SELECT 補 `project_prompt`
- [x] 2.2 新增 `updateKnowledgeBasePrompt(id, prompt)`:service-role、scoped by `user_id`、`updated_at=now()`;空白字串存 `NULL`,回傳更新後 row
  - 測試要求:寫入後 `resolveKb` 讀回相同值;空字串 → 讀回 null

## 3. apps/mcp — guide overlay + 清單標記

- [x] 3.1 `server.ts`:`guide` 工具加可選 `inputSchema: { knowledge_base: z.string().optional() }`,傳入 `guide(fs, slug)`;`instructions` 補一句「處理某 KB 前先 `guide(該 slug)`」
- [x] 3.2 `tools.ts` `guide(fs, slug?)`:有 slug 且 KB `project_prompt` 非空 → 附「## Project conventions — <name>」疊加區塊;KB 清單對有慣例的 KB 加註記;無 slug/無 prompt → 維持現狀
  - 測試要求(tools.test.ts):(a) `guide(slug)` 含 project_prompt 疊加;(b) 該 KB 無 prompt → 等同無疊加;(c) `guide()` 不帶 slug 行為不變;(d) 有 prompt 的 KB 在清單被標記

## 4. apps/api — PATCH 接受 project_prompt

- [x] 4.1 `PATCH /v1/knowledge-bases/:slug` body 增 `project_prompt?: string | null`;`PROJECT_PROMPT_MAX=4000` 超過回 400;呼叫 `updateKnowledgeBasePrompt`;`name` 更新維持相容(可單獨或一併)
  - 測試要求:PATCH 設定 → GET 清單帶回;超長 → 400;清空 → null

## 5. apps/web — KB 設定 UI

- [x] 5.1 `lib/types.ts` `KnowledgeBase` 加 `project_prompt: string | null`;`useKBStore` 加 `updateKBPrompt(id, prompt)`(PATCH `{ project_prompt }`)
- [x] 5.2 `WikiSelector` 選單加「設定 / 整理偏好」→ Dialog(textarea 綁 `project_prompt`,顯示字數/上限,存檔呼叫 store、成功 toast)
  - 測試要求(手動,apps/web 無 harness):設定 prompt → 重開 dialog 仍在;清空可儲存

## 6. 驗證

- [x] 6.1 `pnpm -r test` 綠(shared/mcp/api 單元測試)
- [x] 6.2 `pnpm --filter @team-kms/web exec tsc --noEmit` + `build` 通過
- [x] 6.3 docs:`docs/architecture/modules/mcp-server.md` 補 `guide` 的 `knowledge_base` 疊加說明;`database.md` KB 欄位補 `project_prompt`
