## 1. Capture ground truth

- [x] 1.1 Ensure local Supabase is up-to-date (`supabase db reset` on the CURRENT 13 migrations) so the DB reflects the true end-state
- [x] 1.2 `pg_dump --schema-only` the `public` schema → save as `before.sql` (baseline reference; normalize: strip SET/OWNER/comment noise)
- [x] 1.3 Inventory objects from the dump: 8 tables, 2 views (sources/wiki_pages), functions/triggers (handle_new_user, slug, updated_at×3, document_number, document_changes), all indexes incl. PGroonga + partial-unique, extensions (pgroonga)

## 2. Author the consolidated baseline

- [x] 2.1 Write a single `<ts>_initial.sql` recreating every object from the inventory, semantics unchanged
- [x] 2.2 Order columns per convention (id → FKs → domain → status/kind → metadata → timestamps); add readable section comments
- [x] 2.3 Add `grant select,insert,update,delete on public.<t> to service_role` + `enable row level security` for every table; preserve existing SELECT RLS policies; no anon/authenticated grants
- [x] 2.4 Move the old 13 migrations into `supabase/migrations/_archive/` (CLI ignores subdirs) — or delete (git keeps history)

## 3. Verify equivalence

- [x] 3.1 `supabase db reset` from the new baseline → `pg_dump --schema-only` → `after.sql`
- [x] 3.2 Normalized diff `before.sql` vs `after.sql` == 0 (fix baseline until empty)
- [x] 3.3 Run full live suites (shared/api/mcp/converter) against the reset DB → all green

## 4. Wrap-up

- [x] 4.1 Update any schema references in `docs/architecture/*` if wording drifted
- [x] 4.2 Confirm `.claude/rules/supabase-migrations.md` conventions satisfied (grants + RLS checklist)
