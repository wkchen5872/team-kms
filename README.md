# Team KMS

A team knowledge wiki where **Claude writes the wiki**. Upload sources; Claude reads
them over MCP and compiles an interlinked, cited wiki. Node.js port of
[lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — Postgres/Supabase only,
no Chrome extension. See [docs/architecture.md](docs/architecture.md).

## Layout

```
packages/shared   VaultFS, db (RLS), auth (Supabase JWT), s3, chunker, references
apps/mcp          Hosted MCP server (Claude's read+write interface)
apps/api          REST API for the web app (KBs, documents, graph, upload)
apps/converter    PDF/Office → markdown (opendataloader Java CLI + LibreOffice)
apps/web          Next.js: auth, KB list, wiki browse, knowledge graph
supabase/         Migrations (Postgres + PGroonga + RLS)
```

## Prerequisites

- Node.js ≥ 22, pnpm, a JVM (Java 11+, for the converter)
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker (local stack)
- LibreOffice (only if ingesting Office files)

## Setup

```bash
pnpm install
supabase start                 # boots Postgres+Auth+Storage, applies migrations
cp .env.example .env           # then fill keys from `supabase status -o env`
# create apps/web/.env.local with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / _API_URL
```

## Run (dev)

One command starts all four services (each auto-loads the root `.env`):

```bash
pnpm dev      # converter :8002 · api :8000 · mcp :8001 (Claude) · web :3000
```

Or individually, e.g. `pnpm --filter @team-kms/api dev`. For production, `docker compose up`.

## Test

```bash
supabase start      # tests run against the local stack
pnpm -r test        # 83 integration tests across shared/api/mcp/converter
```

Full testing walkthrough (automated suite + manual end-to-end + connecting Claude over
MCP + troubleshooting): **[docs/testing.md](docs/testing.md)**.

## Connecting Claude

Point an MCP client (Claude Code, or claude.ai for scheduled Routines) at the `apps/mcp`
URL with a Supabase access token. Claude calls `guide` to orient, then `search`/`read`/
`create`/`edit`/`append`/`lint` to compile and maintain the wiki.

## Inspired By

- [Karpathy's LLM Wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — the Python project this ports
