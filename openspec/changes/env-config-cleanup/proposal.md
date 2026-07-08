## Why

Environment configuration has become confusing mid-deployment. A single root
`.env` is doing three unrelated jobs (CLI/deploy credentials, backend local
runtime, and dead `NEXT_PUBLIC_*` that nothing reads), while the real web env
lives in a fourth, easy-to-miss file (`apps/web/.env.local`). `.env.cloud`
carries clutter (ports, service URLs) that Cloud Run does not need, and
`.env.example` is a flat list with no indication of which file each var belongs
to, whether it is local or cloud, or whether it can even be filled yet. The
result: the operator cannot tell what to fill where, or what is not yet ready.

## What Changes

- Establish a **clear responsibility per file** along two axes — purpose
  (CLI/deploy vs backend runtime vs web build-arg) and environment (local vs
  cloud):
  - `.env` — CLI/deploy credentials **+** backend **local** runtime.
  - `.env.cloud` — backend **cloud** runtime only (fed to `--set-env-vars`).
  - `apps/web/.env.local` — web **local** `NEXT_PUBLIC_*` (Next.js reads this).
  - web **cloud** `NEXT_PUBLIC_*` — passed as `--build-arg` at deploy, no
    persistent file.
- **Remove dead/clutter vars**: `NEXT_PUBLIC_*` from root `.env` (web never
  reads it); `*_PORT` and `API_URL`/`MCP_URL`/`APP_URL` from `.env.cloud`
  (Cloud Run injects `PORT`; service URLs are deploy outputs).
- **Rewrite `.env.example`** into labelled sections (A CLI/deploy · B-local ·
  B-cloud · C-web), each var annotated with: which file, local vs cloud, and
  status (ready / fill-me / deploy-output).
- Classify the three "not ready" kinds so they are unambiguous: **fill-me**
  (value exists, not yet entered), **deploy-output** (cannot be filled until a
  prior service is deployed — `CONVERTER_URL`, `NEXT_PUBLIC_API_URL`), and
  **dead** (should be deleted).

## Capabilities

### New Capabilities
- `env-configuration`: the authoritative layout of environment files — which
  file owns which variables, the local/cloud split, and a self-documenting
  `.env.example` that states scope and readiness for every var.

### Modified Capabilities
<!-- None. No existing spec's requirements change; this is additive config hygiene. -->

## Impact

- **Files**: `.env.example` (rewritten), root `.env` (dead vars removed),
  `.env.cloud` (clutter removed), `apps/web/.env.local` (unchanged, documented).
- **No code change**: `config.ts` schema and service `--env-file` loading are
  unaffected; this is purely which file holds which values.
- **Supports** the in-flight `cloud-run-demo-deploy` change: a clean `.env.cloud`
  is what its Cloud Run deploy step consumes.
- **Not affected**: the guarded scripts (`supabase-push.sh`, `migrate-*.sh`)
  keep reading `.env`; credentials stay there.
