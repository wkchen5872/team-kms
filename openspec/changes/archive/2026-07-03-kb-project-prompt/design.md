## Context

wiki 的「實體/概念」是**使用者電腦上的 Claude** 透過 MCP 撰寫的,行為由全域 `prompts/guide.md`(經 `guide` 工具回傳)+ server `instructions` 引導,後端不呼叫 LLM(見 `docs/architecture/workflows.md` 全景圖)。目前 guide 是全域單一版本,無法針對單一 KB 疊加偏好。`knowledge_bases` 現有欄位:`id, user_id, name, slug, description, created_at, updated_at`;`resolveKb`/`listKnowledgeBases` 只 SELECT `id,name,slug(,created_at)`。KB 的 rename 已走 service-role(該表僅 SELECT RLS policy)。

## Goals / Non-Goals

**Goals:**
- 每 KB 一段 project prompt,team 共用、server 端儲存、Web 可編輯。
- Claude 處理某 KB 時能拿到「全域 guide + 該 KB 疊加」。

**Non-Goals:**
- 不動 ingest / 抽取 / converter。
- 不做結構化分區(entities/concepts 各自欄位)——先 freeform 單塊。
- 不強制 Claude 一定讀到疊加(guide 本質 advisory);僅以清單標記 + instructions 提示。

## Decisions

- **儲存**:`knowledge_bases.project_prompt TEXT`(nullable)。新 migration 為 `ALTER TABLE … ADD COLUMN`,既有表加欄位 → 沿用該表既有 grants,**不需**補 GRANT/RLS(對照 `supabase-migrations` 規範:僅 `CREATE TABLE` 才需補)。
- **讀取**:`resolveKb` 與 `listKnowledgeBases` 的 SELECT 補上 `project_prompt`。KB 清單本來就小(per-user),把 `project_prompt` 併進 list 回傳即可,前端不需額外 GET 單一 KB。
- **寫入**:`vaultfs` 新增 `updateKnowledgeBasePrompt(id, prompt)`(service-role,scoped by `user_id`,`updated_at=now()`)。空字串/空白 → 存 `NULL`。
- **guide overlay**:`guide` 工具加可選 `knowledge_base`。`tools.ts` 的 `guide(fs, slug?)`:無 slug → 現狀;有 slug 且該 KB `project_prompt` 非空 → `GUIDE_TEXT + KB 清單 + "\n\n## Project conventions — <name>\n<project_prompt>"`。清單行對有慣例的 KB 加註記(例如 `— 有專屬整理慣例`)。
- **API**:`PATCH /knowledge-bases/:slug` body 增 `project_prompt?: string | null`;長度上限 `PROJECT_PROMPT_MAX = 4000` 字元,超過回 400;`name` 仍可單獨或一併更新(維持向後相容)。
- **Web**:`KnowledgeBase` 型別加 `project_prompt`;`useKBStore` 加 `updateKBPrompt(id, prompt)`(PATCH);WikiSelector 選單加「設定 / 整理偏好」項 → Dialog 內含 textarea,存檔呼叫 store。

## Risks / Trade-offs

- **Advisory 非強制**:若 client Claude 一個 session 只 `guide()` 一次且不帶 slug,可能吃不到疊加。緩解:清單標記 + server `instructions` 補一句「處理某 KB 前先 `guide(slug)`」。接受殘留風險。
- **data→instruction**:project prompt 是 team 成員寫、餵給 Claude 的指令;成員本就可寫 wiki 內容,信任邊界不變。長度上限防爆 token。
- **freeform vs 結構化**:先 freeform;guide.md 已定義 overview/concepts/entities/log 分區,Claude 能自行對應「entities 要 timeline」這類指示。不足再升級,不在本次。
