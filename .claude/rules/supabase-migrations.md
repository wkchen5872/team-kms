# Supabase Migration 規範

## 背景

Supabase 將從 **2026-05-30** 起，新建 project 預設不再對 `public` schema 自動授權 Data API；**2026-10-30** 起，現有 project 也會被強制套用。

之後任何 `CREATE TABLE public.xxx` 若沒有顯式 `GRANT`，PostgREST / supabase-js / GraphQL 都會回 `42501` 錯誤拿不到資料。

來源：Supabase 官方公告（May 30 / October 30, 2026 rollout）

## 強制規範

所有新建 migration 在 `CREATE TABLE public.xxx` 後，**必須**附上對應的 GRANT 與 RLS：

```sql
create table public.xxx (
  ...
);

-- 本專案只透過 Workers 用 service_role 連線；無 anon / authenticated 直連需求
grant select, insert, update, delete on public.xxx to service_role;

-- 啟用 RLS（service_role bypass，但仍應預設啟用以防未來開放給其他 role）
alter table public.xxx enable row level security;
```

## 何時加 anon / authenticated grant

僅當該表確實需要被 **瀏覽器端**（透過 anon key）或 **登入使用者**（authenticated）直接讀寫時才補上：

```sql
grant select on public.xxx to anon;
grant select, insert, update, delete on public.xxx to authenticated;

create policy "..." on public.xxx for select to authenticated using (...);
```

目前本專案 Workers 皆走 service_role，**預設不要**加 anon / authenticated grant。

## 不需回頭改的事

- 既有 `_archive/` 與已套用的 migration **不要**補 GRANT — 既有表的 grants 會被 Supabase 保留。
- 若要開新的 Supabase project（staging / 第二環境）並 replay 整套 migration，再評估是否一次補齊。

## 檢查清單

新 migration 提交前自檢：

- [ ] 每個 `create table public.xxx` 後都有 `grant ... to service_role`
- [ ] 每個 `create table public.xxx` 後都有 `alter table ... enable row level security`
- [ ] 確認沒有誤加 anon / authenticated grant（除非該表確實需要直連）
