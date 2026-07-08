## Context

Everything runs on `localhost` today: local Postgres+PGroonga, local Supabase
(Auth/Storage), and a local `docker-compose.yml` that runs `web`/`api`/`mcp`/
`converter` but externalizes the DB/Auth/Storage to Supabase. The compiled wiki
lives only in the local DB. We want the team to view it quickly, and to use the
same deploy to flush out production integration issues.

Hard constraints discovered while exploring:
- **PGroonga is non-negotiable**: the initial migration does
  `CREATE EXTENSION pgroonga`, builds `USING pgroonga` indexes, and search uses
  the `&@~` operator + `pgroonga_score()` with no fallback. Any target Postgres
  must ship pgroonga. Cloud SQL does not; **hosted Supabase does** (enable via
  dashboard).
- **converter needs JVM + LibreOffice + a writable `/tmp`** (`mkdtemp` +
  `spawn soffice` + opendataloader). It cannot run on Workers, but runs on Cloud
  Run as a normal container.
- **Content must be preserved, not recompiled** — the compile was expensive.
- **No per-user permission model exists** — RLS is strict owner (`d.user_id`).

## Goals / Non-Goals

**Goals:**
- Team can view the compiled wiki at a shared HTTPS URL.
- Full ingest path (incl. converter) deployed, so production problems surface now.
- Credentials scoped to this repo; no collision with other repos' OAuth.

**Non-Goals:**
- No `mcp` deployment (stays local); no daemon/auto-compile.
- No per-user permissions / KB sharing design (Plan A shared account instead).
- No ongoing DB replication — migration is a one-shot.
- No production hardening beyond what the dress rehearsal needs (autoscaling
  policy, custom domains, CI pipeline are follow-ups).

## Decisions

**D1 — Compute on Cloud Run, data on hosted Supabase.**
Cloud Run runs the existing Dockerfiles (stateless, scale-to-zero) while hosted
Supabase owns DB (pgroonga) + Auth + Storage. *Alternatives:* Cloud SQL (rejected
— no pgroonga); single Compute Engine VM running compose (viable fallback, but
babysits a VM and loses scale-to-zero); Cloudflare Workers (rejected — cannot run
converter's JVM/LibreOffice).

**D2 — Deploy all three services, converter included.**
Even though a read-only demo could skip converter, deploying it now is the whole
point: it exercises memory-backed `/tmp`, cold start, and TUS-to-Storage before
production. *Alternative:* defer converter (rejected — leaves the riskiest piece
unverified).

**D3 — Plan A: single shared demo account.**
Remap all content `user_id` to one account via a single `UPDATE`; do not migrate
`auth.users`. *Alternative:* migrate `auth.users` preserving UUIDs (more work,
and still per-user so team members would each see only their own — wrong for a
shared demo); build KB sharing (out of scope, no permission design yet).

**D4 — One-time `pg_dump`/restore, no recompile.**
Dump application tables from local, restore to hosted, then run the `user_id`
remap. Storage assets copied only if "download original file" is needed.

**D5 — Project-scoped credentials in `.env`.**
GCP via Service Account key (`GOOGLE_APPLICATION_CREDENTIALS`) — the correct
mechanism for automated deploys and inherently per-project. Supabase via
`SUPABASE_ACCESS_TOKEN` + explicit `--project-ref`. Extends the existing
"services read config from `.env`" pattern. *Alternative:* isolated
`CLOUDSDK_CONFIG` dir with interactive login (kept as a documented option for
humans who prefer it).

**D6 — Minimal runtime code changes.**
`PORT` fallback in the three services; `NEXT_PUBLIC_*` as build args with
`next start`; `LISTEN` on a session-mode connection. These are the smallest edits
that make the existing code run on the new substrate.

## Risks / Trade-offs

- **Transaction pooler silently drops `LISTEN`** → route the listener through a
  session pooler / direct connection; verify NOTIFY delivery end-to-end.
- **converter OOM on large files** (memory-backed `/tmp`) → `--memory 2Gi`,
  `--concurrency 1–2`; document the file-size ceiling.
- **converter cold start** (JVM + LibreOffice boot) → `--min-instances 1`.
- **RLS hides content after migration** (wrong `user_id`) → the `UPDATE` remap is
  a gated step; verify the shared account sees content before declaring done.
- **Committing a Service Account key** → add `.gcloud/` to `.gitignore` **first**;
  verify with `git check-ignore`.
- **TUS upload against Supabase Storage S3 endpoint may behave differently** →
  smoke-test one upload through the deployed api.
- **Laptop-independence** achieved (hosted Supabase + Cloud Run), but this is a
  demo/rehearsal, not a hardened production deployment.

## Migration Plan

1. Extend `.gitignore` (`.gcloud/`, `supabase/.temp`) and `.env.example`.
2. Create hosted Supabase project; enable `pgroonga`; apply migrations.
3. Land code changes (`PORT`, `NEXT_PUBLIC_*` build args, `LISTEN` connection).
4. Build + push images; `gcloud run deploy` converter (internal), then api
   (`--session-affinity`, `CONVERTER_URL`), then web (build-arg public URLs).
5. `pg_dump` local → restore to hosted; create shared account; `UPDATE user_id`.
6. (Optional) copy Storage assets if original-file download is required.
7. Verify: shared login sees content, search works, one upload converts.

**Rollback:** delete Cloud Run services and the hosted Supabase project; nothing
local changed (compose intact, one-way data copy).

## Open Questions

Both resolved during planning:
- **Original-file download is in scope** — "original file" = the file the user
  uploaded. Storage assets MUST be copied to hosted Storage (task 4.5 is
  required, not optional).
- **Content is single-owner** — the `user_id` remap is a straight
  single-owner → shared-account `UPDATE`; no multi-owner collapse needed.
