## ADDED Requirements

### Requirement: Single baseline migration reproduces the current schema
The `supabase/migrations/` set SHALL be consolidated into a single baseline migration that reproduces the current database schema exactly — all tables, views, functions, triggers, RLS policies, indexes (including PGroonga full-text and the partial unique `idx_documents_unique_active`), and required extensions. Consolidation SHALL NOT change any schema semantics (no added/removed columns, no type or constraint changes).

#### Scenario: fresh reset matches the pre-consolidation schema
- **WHEN** the database is reset from the consolidated baseline and its schema is dumped
- **THEN** a normalized `pg_dump --schema-only` diff against the pre-consolidation schema is empty (structurally equivalent)

#### Scenario: all live tests pass on the consolidated schema
- **WHEN** the shared / api / mcp / converter test suites run against a database migrated from the baseline
- **THEN** they all pass (the application observes no behavioral change)

### Requirement: Logical column ordering
Tables in the baseline SHALL order columns logically: `id`, then foreign keys, then domain columns, then status/kind, then metadata/jsonb/tags, then `created_at`/`updated_at` last. This is a display-only改善 and SHALL NOT require recreating tables outside the consolidation itself.

#### Scenario: columns follow the convention
- **WHEN** a consolidated table definition is inspected
- **THEN** its columns appear in the id → FKs → domain → status → metadata → timestamps order

### Requirement: Service-role grants and RLS on every public table
Every `public` table in the baseline SHALL have `GRANT select, insert, update, delete … TO service_role` and `ENABLE ROW LEVEL SECURITY`, per the project migration convention. Existing SELECT-only RLS policies SHALL be preserved. No `anon`/`authenticated` grants SHALL be added (Workers connect as service_role).

#### Scenario: grants present for all tables
- **WHEN** the baseline is applied
- **THEN** each public table has an explicit service_role grant and RLS enabled
- **AND** no table grants privileges to anon or authenticated
