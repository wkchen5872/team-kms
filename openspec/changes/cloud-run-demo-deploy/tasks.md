## 1. Credential isolation (do first — prevents secret leakage)

- [x] 1.1 Add `.gcloud/` and `supabase/.temp` to `.gitignore`; verify with `git check-ignore .gcloud/sa-key.json`
- [x] 1.2 Add placeholders to `.env.example`: `GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_CORE_PROJECT`, `SUPABASE_ACCESS_TOKEN` (no real values)
- [ ] 1.3 Create GCP Service Account + key under `.gcloud/`; put path in local `.env`. Confirm `gcloud` uses it without a user-level `gcloud auth login`
- [ ] 1.4 Generate a Supabase personal access token; set `SUPABASE_ACCESS_TOKEN` in `.env`

## 2. Runtime code changes (TDD)

- [x] 2.1 `PORT` support in `apps/api`, `apps/mcp`, `apps/converter`: listen on `process.env.PORT ?? <existing *_PORT default>`.
      Test requirement: unit test asserting resolved port = `PORT` when set, else the legacy default (Red before Green)
- [x] 2.2 `LISTEN` connection mode in `packages/shared`: ensure the `document_changes` listener uses a session-mode / direct connection, not the transaction pooler.
      Test requirement: test (or documented integration check) that NOTIFY is received over the chosen connection
- [x] 2.3 `apps/web` build: `NEXT_PUBLIC_*` sourced from build args (public Supabase + api URLs); production run uses `next build && next start`.
      Verify: built bundle contains no `localhost`/`127.0.0.1` for these vars
- [x] 2.4 Run full suite (`pnpm test`, `pnpm typecheck`, `pnpm lint`); no regressions

## 3. Hosted Supabase provisioning

- [x] 3.1 Create hosted Supabase project; record project-ref and connection strings (transaction pooler for queries, session pooler/direct for LISTEN)
- [x] 3.2 Enable `pgroonga` extension in the dashboard
- [x] 3.3 Apply existing migrations (`supabase db push --project-ref <ref>`); confirm pgroonga indexes created
- [x] 3.4 Smoke-test a `&@~` query against `document_chunks` in the hosted DB

## 4. One-time content migration (Plan A)

- [x] 4.1 `pg_dump` the application tables (documents, document_chunks, document_references, knowledge_bases, …) from local
- [x] 4.2 Restore the dump into the hosted DB; compare row counts to source
- [x] 4.3 Create the shared demo account in hosted Supabase Auth; capture its UUID
- [x] 4.4 `UPDATE` all migrated content `user_id` to the shared UUID (content is single-owner → straight remap; no `auth.users` migration)
- [ ] 4.5 Copy Storage assets (originally-uploaded files) to hosted Supabase Storage — required: the demo includes original-file download

## 5. Cloud Run deployment

- [ ] 5.1 Set up Artifact Registry; build + push `web`, `api`, `converter` images
- [ ] 5.2 Deploy `converter`: `--memory 2Gi --min-instances 1 --concurrency 1-2 --ingress internal`, env incl. `CONVERTER_SECRET`
- [ ] 5.3 Deploy `api`: `--session-affinity`, env `CONVERTER_URL` = converter internal URL, hosted Supabase `DATABASE_URL`/`SUPABASE_*`/`S3_*`, `CONVERTER_SECRET`
- [ ] 5.4 Deploy `web`: build-arg public URLs (`NEXT_PUBLIC_API_URL` = api's URL, `NEXT_PUBLIC_SUPABASE_URL`/anon key), `next start`
- [ ] 5.5 Record the three service URLs; capture deploy steps as a script / notes (not a compose file)

## 6. Verification (dress-rehearsal checklist)

- [ ] 6.1 Sign in with the shared account on the deployed web → migrated content is visible (RLS ok)
- [ ] 6.2 Run a search in the UI → pgroonga results return
- [ ] 6.3 Upload one file through the deployed api → TUS→Storage works, converter converts, WebSocket progress arrives
- [ ] 6.4 Download an original uploaded file from a migrated document → served from hosted Storage
- [ ] 6.5 Confirm `mcp` is not deployed and `docker-compose.yml` has no diff
- [ ] 6.6 Share the web URL with the team
