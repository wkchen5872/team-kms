## ADDED Requirements

### Requirement: Services honor the PORT environment variable

Each deployed service SHALL listen on `process.env.PORT` when set, falling back
to its existing `*_PORT` default, so Cloud Run's injected `PORT=8080` is used.

#### Scenario: Cloud Run starts the service
- **WHEN** Cloud Run runs a service container with `PORT=8080`
- **THEN** the service listens on 8080 and passes the startup health check

#### Scenario: Local default preserved
- **WHEN** `PORT` is unset locally
- **THEN** the service listens on its existing default (e.g. `API_PORT` 8000)

### Requirement: Web bakes public URLs at build time

The `web` build SHALL inline `NEXT_PUBLIC_*` from public URLs (hosted Supabase +
api's Cloud Run URL) and run via `next start`, not `next dev`.

#### Scenario: Browser reaches public endpoints
- **WHEN** a team member loads the deployed web app
- **THEN** its `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SUPABASE_URL` point at
  public URLs (no `localhost`/`127.0.0.1`)

### Requirement: LISTEN uses a session-mode connection

The Postgres `LISTEN` used for `document_changes` SHALL connect via a session
pooler or direct connection, not the transaction-mode pooler.

#### Scenario: NOTIFY delivered against hosted Supabase
- **WHEN** `api` runs against hosted Supabase and a `document_changes` NOTIFY fires
- **THEN** the listener receives it (the transaction pooler does not silently drop
  `LISTEN`)
