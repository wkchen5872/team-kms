# env-configuration

The layout of environment files: which file owns which variables, the local/cloud
split, and a self-documenting `.env.example`.

## Requirements

### Requirement: Each env file has a single responsibility

Environment variables SHALL be organized by purpose × environment, with one
clearly-owned file per concern.

#### Scenario: File ownership is unambiguous
- **WHEN** an operator needs to set a variable
- **THEN** exactly one file owns it, per this map:
  - `.env` → CLI/deploy credentials **and** backend local runtime
  - `.env.cloud` → backend cloud runtime only
  - `apps/web/.env.local` → web local `NEXT_PUBLIC_*`
  - web cloud `NEXT_PUBLIC_*` → passed as `--build-arg` at deploy (no file)

#### Scenario: CLI/deploy credentials are environment-agnostic
- **WHEN** placing `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
  `GOOGLE_APPLICATION_CREDENTIALS`, or `CLOUDSDK_CORE_PROJECT`
- **THEN** they live only in `.env` (one copy, not split local/cloud) because
  they authenticate the local machine to cloud services regardless of target

### Requirement: Dead and clutter variables are removed

Variables that no consumer reads SHALL NOT appear in a file.

#### Scenario: No NEXT_PUBLIC in root .env
- **WHEN** inspecting root `.env`
- **THEN** it contains no `NEXT_PUBLIC_*` (the web app reads
  `apps/web/.env.local`, backend services ignore them)

#### Scenario: No ports or service URLs in .env.cloud
- **WHEN** inspecting `.env.cloud`
- **THEN** it contains no `*_PORT` (Cloud Run injects `PORT`) and no
  `API_URL`/`MCP_URL`/`APP_URL` (these are deploy outputs, not inputs)

### Requirement: .env.example self-documents scope and readiness

`.env.example` SHALL be organized into labelled sections and annotate every
variable with its file, its local/cloud scope, and its readiness state.

#### Scenario: Sections by purpose
- **WHEN** reading `.env.example`
- **THEN** variables are grouped under A (CLI/deploy), B-local, B-cloud, and
  C (web), each section stating which file the values belong in

#### Scenario: Readiness is explicit
- **WHEN** a variable cannot be filled immediately
- **THEN** its comment marks it as `fill-me` (value exists, enter it),
  `deploy-output` (filled only after a prior service deploys — e.g.
  `CONVERTER_URL`, `NEXT_PUBLIC_API_URL`), or notes it is optional
