## Context

13 個 migration,pre-launch。目標:squash 成單一 baseline,同時得到邏輯欄位順序 + service_role grant,
且**不改變 schema 語意**(end-state 完全等價)。風險核心是「squash 漏掉某個物件 → drift」,故以現有 DB 的
`pg_dump` 當 ground truth,並以 diff 驗證。

## Goals / Non-Goals

**Goals:**
- 單一 baseline 精確重現目前所有 schema 物件(表/view/function/trigger/RLS/index/PGroonga)。
- 欄位邏輯排序;每張 public 表補 `grant … to service_role` + RLS。
- 以 schema diff 為零證明等價。

**Non-Goals:**
- 任何 schema 語意變更(欄位增減、型別改變、約束改變)。
- 為排序而重建既有表(排序只是 squash 重寫的副產品)。
- 上線後的 migration 策略(此 squash 僅限未上線)。

## Decisions

**D1. 用 `pg_dump --schema-only` 當 ground truth,不靠手抄。**
先從跑著的本機 DB dump 出目前 schema 作為對照基準。baseline 手工整理成可讀版(排序 + 註解 + grant),
但正確性由「fresh `db reset` 的 dump」對比「squash 前的 dump」**diff 為零**保證。手抄容易漏 view/trigger/PGroonga。

**D2. 欄位順序慣例(重寫 CREATE TABLE 時套用)。**
`id` → 外鍵(user_id / knowledge_base_id / *_document_id)→ 領域欄位(filename/path/title/content…)→
狀態/分類(status / kind)→ metadata / jsonb / tags → `created_at` / `updated_at` 最後。
純顯示層調整,對明確欄位清單的程式碼無影響。

**D3. 全表補 service_role grant + RLS(比照 supabase-migrations.md)。**
目前只有 `document_raw` 有顯式 grant;其餘靠舊 project 的隱式授權。squash = 等同重新 replay 整套,
故每張表補 `grant select, insert, update, delete on public.<t> to service_role;` + `enable row level security;`。
既有的 SELECT-only RLS 政策原樣保留(app 寫入走 service_role bypass)。**不**加 anon/authenticated grant(本專案 Workers 皆 service_role)。

**D4. 保留舊檔於 `_archive/`(可選)或直接刪除。**
squash 後原 13 檔對開發歷史仍有參考價值;傾向移進 `supabase/migrations/_archive/`(supabase CLI 不會執行子目錄),
或直接刪(git 歷史仍在)。預設:移進 `_archive/` 保留可讀性。

**D5. 驗證 = diff 為零 + 全測試綠。**
`supabase db reset`(套用新 baseline)→ 再次 `pg_dump --schema-only` → 與步驟前的 dump 正規化後 diff。
接著跑 shared/api/mcp/converter 全套 live 測試(它們針對真 DB),全綠才算等價。

## Risks / Trade-offs

- **漏物件(drift)** → D1 的 diff-為零驗證是主要防線;差異逐一補回 baseline。
- **dump 內含 supabase 系統物件雜訊**(auth schema、擴充等)→ 只 dump `public` schema + 明確排除系統物件,diff 前正規化(去除 `SET`/OWNER/註解差異)。
- **PGroonga / auth trigger 依賴** → baseline 需含 `create extension`(pgroonga)與 `on_auth_user_created`(依賴 auth.users);dump 會帶出,確認保留。
- **開發者本機資料清空** → `db reset` 清資料;pre-launch 可接受,執行前提醒。
- **順序慣例的主觀性** → 只求可讀一致,不追求「完美」;避免過度雕琢。

## Migration Plan

1. `pg_dump --schema-only`(public)存為對照基準 `before.sql`。
2. 撰寫單一 `<ts>_initial.sql`(排序 + grant + 註解),移舊 13 檔進 `_archive/`。
3. `supabase db reset` → `pg_dump` 成 `after.sql` → 正規化 diff == 0。
4. 全套測試綠。
5. rollback:還原 `_archive/` 的 13 檔即回到舊狀態(git revert)。

## Open Questions

- 舊檔:移 `_archive/` 保留 vs 直接刪?預設移 `_archive/`(git 已保存歷史,但子目錄留檔對照方便)。
- baseline 時間戳:沿用最早的 `20260404171142` 還是新開一個?傾向沿用最早時間戳語意(這是「初始 schema」)。
