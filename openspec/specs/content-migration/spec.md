# content-migration

<!-- Synced from change cloud-run-demo-deploy -->

## Requirements

### Requirement: One-time content transfer without recompile

The system SHALL transfer the compiled content from the local Supabase DB to the
hosted DB via `pg_dump`/restore, and SHALL NOT re-run the MCP compile.

#### Scenario: Compiled content present after migration
- **WHEN** the one-time migration completes
- **THEN** the hosted DB's `documents` and `document_chunks` row counts match the
  local source
- **AND** no MCP compile step was executed

### Requirement: Ownership remapped to a single shared demo account

Because no per-user permission design exists, all migrated content SHALL be owned
by one shared demo account so any team member logging in with it can view
everything under RLS.

#### Scenario: Content visible to the shared account
- **WHEN** a user signs in with the shared demo account and opens a knowledge base
- **THEN** RLS (`d.user_id = <shared uuid>`) returns the migrated documents
- **AND** the remap was done by a single `UPDATE` of `user_id`, without migrating
  `auth.users`

### Requirement: Original uploaded files are migrated to hosted Storage

The demo includes downloading the originally-uploaded files, so the migration
SHALL copy the corresponding Storage assets to hosted Supabase Storage.

#### Scenario: Original file downloads after migration
- **WHEN** a user opens a migrated document and requests the original file
- **THEN** `api` serves it from hosted Storage (asset copied during migration)
