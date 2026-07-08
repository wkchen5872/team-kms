## 1. Authoritative reference

- [ ] 1.1 Rewrite `.env.example` into labelled sections: **A** (CLI/deploy creds),
      **B-local** (backend local runtime), **B-cloud** (backend cloud runtime),
      **C** (web `NEXT_PUBLIC_*`). Head each section with which file the values go in.
- [ ] 1.2 Annotate every variable with local/cloud scope and readiness marker:
      `fill-me` / `deploy-output` / optional. Mark `CONVERTER_URL` and
      `NEXT_PUBLIC_API_URL` (cloud) as `deploy-output`.

## 2. Clean the live files

- [ ] 2.1 Remove `NEXT_PUBLIC_*` from root `.env` (web reads `apps/web/.env.local`;
      backend ignores them)
- [ ] 2.2 Remove `*_PORT` and `API_URL`/`MCP_URL`/`APP_URL` from `.env.cloud`
      (Cloud Run injects `PORT`; service URLs are deploy outputs)
- [ ] 2.3 Confirm `apps/web/.env.local` holds only the three `NEXT_PUBLIC_*` (local)
      and nothing else

## 3. Fill what's ready

- [ ] 3.1 `.env.cloud`: fill `DATABASE_LISTEN_URL` with the hosted **session pooler**
      connection string
- [ ] 3.2 `.env.cloud`: fill hosted S3 vars (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
      `S3_ENDPOINT`/`AWS_REGION`) from the hosted S3 access keys already generated
- [ ] 3.3 Leave `deploy-output` vars (`CONVERTER_URL`, `NEXT_PUBLIC_API_URL`) blank —
      the Cloud Run deploy step fills them in sequence

## 4. Verify

- [ ] 4.1 Backend still boots locally against `.env` (`pnpm dev` for one service) —
      no missing-var errors after the cleanup
- [ ] 4.2 `.env.example` review: every var present in `.env`/`.env.cloud`/
      `apps/web/.env.local` appears in `.env.example` under the right section, and
      vice-versa (no drift)
