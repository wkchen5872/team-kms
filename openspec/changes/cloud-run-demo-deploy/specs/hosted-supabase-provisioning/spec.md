## ADDED Requirements

### Requirement: Hosted Supabase project provisioned with pgroonga

The system SHALL use a hosted Supabase SaaS project as the DB + Auth + Storage
plane, with the `pgroonga` extension enabled before migrations run.

#### Scenario: pgroonga available before migration
- **WHEN** the migrations are applied to the hosted project
- **THEN** `CREATE EXTENSION IF NOT EXISTS pgroonga` succeeds
- **AND** the `USING pgroonga` indexes are created without error

### Requirement: Existing migrations applied to hosted DB

The system SHALL apply the repo's existing migrations to the hosted Supabase
database as the schema source of truth.

#### Scenario: Schema matches migrations
- **WHEN** provisioning completes
- **THEN** every table, index, and RLS policy defined in
  `supabase/migrations/` exists in the hosted DB

#### Scenario: PGroonga search operator works
- **WHEN** a `&@~` search query runs against `document_chunks` in the hosted DB
- **THEN** it returns results using the pgroonga index (no operator error)
