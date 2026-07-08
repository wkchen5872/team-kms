## Context

Discovered while mid-way through `cloud-run-demo-deploy`. Ground truth from the
repo:

- Backend services (`api`/`mcp`/`converter`) load root `.env` via
  `tsx --env-file=../../.env`; `config.ts` uses `process.loadEnvFile('.env')`.
- The web app (Next.js) reads `apps/web/.env.local` from its own directory — it
  does **not** read the monorepo-root `.env`. So `NEXT_PUBLIC_*` in root `.env`
  are dead (and one is even empty while the live copy in `apps/web/.env.local`
  is set).
- `.env.cloud` is a staging file for cloud runtime values; nothing reads it yet
  (a future deploy step feeds it to `gcloud run deploy --set-env-vars`).

## Goals / Non-Goals

**Goals:**
- One responsibility per env file; an operator can tell what to fill where.
- `.env.example` states, per variable: file, local/cloud scope, readiness.
- Remove variables no consumer reads.

**Non-Goals:**
- No `config.ts` schema change and no change to how services load env.
- No new env-loading tooling (no dotenv, no direnv).
- Not migrating credentials out of `.env` into a separate `.env.deploy` — kept
  in `.env` so the existing guarded scripts keep working unchanged.

## Decisions

**D1 — Two-axis model: purpose × environment.**
Purpose = {A CLI/deploy creds, B backend runtime, C web build-arg}. Environment
= {local, cloud}, which only splits B and C. A is environment-agnostic (the same
credentials operate the cloud from the laptop regardless of target). This is the
core insight that resolves the confusion (e.g. "does the CLI token change for
local dev?" → no, A has no local/cloud split).

**D2 — Keep A credentials in `.env`, not a separate `.env.deploy`.**
The guarded scripts already `get_env` from `.env`. A dedicated creds file would
be conceptually cleaner but force every script to source two files. *Alternative
rejected* for churn vs benefit; the labelled section in `.env` is enough.

**D3 — Web cloud config via `--build-arg`, no persistent file.**
`NEXT_PUBLIC_*` bake at build. Cloud values depend on the api Cloud Run URL,
known only at deploy time, so a committed file would always be stale. *Alt:*
`apps/web/.env.production` — rejected (invites a stale, misleading file).

**D4 — Three readiness states, made explicit.**
`fill-me` (value exists, enter it), `deploy-output` (`CONVERTER_URL`,
`NEXT_PUBLIC_API_URL` — cannot exist until a prior service deploys), `dead`
(delete). Conflating these is the main reason "what's not ready" felt murky.

## Risks / Trade-offs

- **Removing vars someone relied on** → only remove provably-dead ones
  (`NEXT_PUBLIC_*` in root `.env`, ports/URLs in `.env.cloud`); backend runtime
  vars are untouched.
- **`.env` still mixes A + B-local** → accepted (D2); the section headers carry
  the clarity instead of a file split.
- **`.env`/`.env.cloud` are gitignored** → the authoritative reference is
  `.env.example`, which is committed; it must stay in sync when vars change.

## Migration Plan

1. Rewrite `.env.example` into A / B-local / B-cloud / C sections with per-var
   scope + readiness annotations.
2. Remove `NEXT_PUBLIC_*` from root `.env`.
3. Remove `*_PORT` and `API_URL`/`MCP_URL`/`APP_URL` from `.env.cloud`; fill the
   `fill-me` cloud vars (`DATABASE_LISTEN_URL`, hosted S3 keys).
4. Leave `deploy-output` vars blank; the deploy step fills them in sequence.

## Open Questions

- Should `.env.cloud` be split per service (api vs converter need different
  subsets)? For a demo, one file + a deploy-time allowlist is simpler; revisit
  if per-service env diverges.
