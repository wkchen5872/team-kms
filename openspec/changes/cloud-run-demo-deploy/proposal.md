## Why

The system currently runs only on `localhost` (local Postgres+PGroonga, local
Supabase Auth/Storage, local `docker-compose`). The team cannot see the compiled
wiki. We need a fast, low-risk deployment so members can view the current
results — and this deploy doubles as a **dress rehearsal** for production,
surfacing the real integration problems (`$PORT` contract, Supabase pooler vs
`LISTEN`, TUS-to-Storage, RLS under real Auth) while stakes are low.

Compute goes to **Google Cloud Run** (three containers); the data/auth/storage
plane goes to **hosted Supabase SaaS** (which supports the required `pgroonga`
extension). MCP stays local. The full ingest path (including converter) is
deployed on purpose, so nothing about production is left unverified.

## What Changes

- Deploy `web`, `api`, and `converter` as three independent **Cloud Run**
  services from the existing Dockerfiles (no `docker-compose` on Cloud Run;
  the local compose file is untouched and stays for local dev).
- Stand up a **hosted Supabase** project as the DB (with `pgroonga`) + Auth +
  Storage plane; run the existing migrations against it.
- **One-time** data migration from the local Supabase DB to the hosted DB via
  `pg_dump`/restore — deliberately **not** re-running the MCP compile.
- Adopt a **single shared demo account** for viewing (Plan A): no per-user
  permission design exists yet, so content ownership is remapped to one account
  via a single `UPDATE` (no `auth.users` migration).
- Code changes required by the Cloud Run/hosted-Supabase runtime:
  - services honor `process.env.PORT` (Cloud Run injects `PORT=8080`);
  - `web` bakes `NEXT_PUBLIC_*` from public URLs at build time (`next start`,
    not `next dev`);
  - the Postgres `LISTEN` connection uses a session pooler / direct connection,
    not the transaction pooler.
- **Project-scoped credentials** (no user-level OAuth): GCP Service Account key
  and Supabase access token live in this repo's `.env`; `.gitignore` is extended
  so credential files are never committed.
- `mcp` and any daemon-compile remain **out of scope** (not deployed).

## Capabilities

### New Capabilities
- `cloud-run-deployment`: the three services (`web`/`api`/`converter`) deploy to
  Cloud Run with correct sizing, ingress, port, and service-to-service wiring.
- `hosted-supabase-provisioning`: hosted Supabase project provisioned with
  `pgroonga` enabled and migrations applied, serving as DB/Auth/Storage.
- `content-migration`: one-time transfer of compiled content from local to
  hosted Supabase, with ownership remapped to a single shared demo account.
- `runtime-portability-fixes`: code changes making the services runnable under
  Cloud Run + hosted Supabase (`PORT`, build-time `NEXT_PUBLIC_*`, `LISTEN`
  connection mode).
- `credential-isolation`: project-scoped GCP and Supabase credentials that do
  not collide with other repos' user-level OAuth, kept out of version control.

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/; no runtime requirement of an
     existing capability changes (deploy target is additive). -->

## Impact

- **New config/artifacts**: Cloud Run deploy configuration (per-service env,
  memory, ingress, `--session-affinity`), `.env`/`.env.example` additions,
  `.gitignore` additions (`.gcloud/`, `supabase/.temp`).
- **Code touched**: `apps/api`, `apps/mcp`, `apps/converter` (`PORT`); `apps/web`
  (build-arg `NEXT_PUBLIC_*`); `packages/shared` (`LISTEN` connection).
- **External systems**: new hosted Supabase project; GCP project + Cloud Run +
  Artifact Registry + a deploy Service Account.
- **Data**: one-time `pg_dump`/restore of application tables; optional copy of
  Storage assets (only if "download original file" is required).
- **Not affected**: local `docker-compose.yml`, `mcp` deployment, daemon-compile.
