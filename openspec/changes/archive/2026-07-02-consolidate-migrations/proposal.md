## Why

系統尚未上線,`supabase/migrations/` 已累積 13 個檔,含明顯 add-then-drop 雜訊
(`knowledge_bases.kind` 加了又刪、`documents.url` 刪、`parser`/`error_message` 搬進 `document_raw` 後刪)。
趁未上線把整套 squash 成**單一乾淨 baseline**,順手拿到理想欄位順序、補齊 service_role GRANT,
降低新人理解成本並符合專案 migration 規範。

**注意**:Postgres 無法就地調整欄位順序、順序亦僅影響 `SELECT *`/`\d` 顯示(本專案資料層皆用明確欄位清單,
功能無關)。因此欄位順序**只作為 squash 重寫 `CREATE TABLE` 的副產品**達成,**不**為排序而重建表。

## What Changes

- **合併 13 → 1**:以單一 `<ts>_initial.sql` baseline 重現目前**確切** end-state——8 張表
  (users / api_keys / knowledge_bases / documents / document_pages / document_chunks /
  document_references / document_raw)、2 個 view(sources / wiki_pages)、所有 function/trigger
  (handle_new_user、slug、updated_at、document_number、document_changes NOTIFY)、RLS 政策、
  全部 index(含 PGroonga、partial unique `idx_documents_unique_active`、`idx_documents_kb_number`)。
- **欄位邏輯排序**(重寫 CREATE TABLE 時順手):`id` → 外鍵 → 領域欄位 → 狀態/kind → metadata/jsonb → `created_at`/`updated_at`。
- **補 GRANT**:每張 `public` 表補 `grant … to service_role` + `enable row level security`(比照 `supabase-migrations.md`;目前只有 `document_raw` 有顯式 grant)。
- **驗證**:`supabase db reset` 後,fresh schema 與現有 DB 的 `pg_dump --schema-only` **diff 必須為零**。
- **BREAKING(僅開發期)**:migration 歷史重置,需本機 `db reset`(清資料)。**無應用程式碼變更**(明確欄位清單不受順序影響)。

明確**不做**:為欄位順序而重建既有表(squash 之外);任何 schema 語意變更(純結構重整,end-state 不變)。

## Capabilities

### New Capabilities
- `consolidated-schema-migration`: 單一 baseline migration,精確重現目前 schema(表/view/trigger/RLS/index),
  欄位邏輯排序,補齊 service_role grant,並以 schema diff 為零驗證等價。

### Modified Capabilities
<!-- openspec/specs/ 為空;此為結構重整,無既有 capability 規格變更。 -->

## Impact

- **`supabase/migrations/`**:刪除現有 13 個檔,新增 1 個 `<ts>_initial.sql`(或移舊檔進 `_archive/` 保存)。
- **DB**:需 `supabase db reset`(僅本機/未上線)。
- **應用程式碼**:無變更(`vaultfs.ts` 等皆用明確欄位清單)。
- **docs**:如 `architecture/workflows.md` 內的 schema 敘述維持一致(必要時微調)。
- **規範**:遵循 `.claude/rules/supabase-migrations.md`(service_role grant + RLS)。
