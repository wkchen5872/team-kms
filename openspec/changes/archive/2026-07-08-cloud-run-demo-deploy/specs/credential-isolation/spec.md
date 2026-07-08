## ADDED Requirements

### Requirement: Project-scoped credentials, no user-level OAuth

GCP and Supabase credentials for this project SHALL be scoped to this repo and
SHALL NOT rely on user-level OAuth that collides with other repos.

#### Scenario: GCP auth does not touch user login
- **WHEN** a deploy authenticates to GCP
- **THEN** it uses a Service Account key referenced by
  `GOOGLE_APPLICATION_CREDENTIALS` in this repo's `.env` (or an isolated
  `CLOUDSDK_CONFIG`), not a global `gcloud auth login`

#### Scenario: Supabase auth is per-project
- **WHEN** a Supabase CLI operation runs
- **THEN** it uses `SUPABASE_ACCESS_TOKEN` from `.env` and an explicit
  `--project-ref`, not a shared global login

### Requirement: Credential files never committed

Credential material SHALL be excluded from version control, with documented
placeholders only.

#### Scenario: Keys are gitignored
- **WHEN** a Service Account key is placed under `.gcloud/`
- **THEN** `git check-ignore` reports it as ignored
- **AND** `.env.example` documents the credential variables without real values
