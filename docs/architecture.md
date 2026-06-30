# 🏗️ Team KMS Architecture

Node.js port of [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki),
Postgres/Supabase-only, no Chrome extension. **The intelligence lives in Claude**:
the backend only ingests, parses, indexes, and serves; Claude reads sources and
writes the wiki through MCP tools.

> The earlier `docs/team-kms-roadmap.md` and `docs/team-kms-tech-architecture.md`
> are **superseded** by this port (they assumed a backend LLM "compiler"). This
> document is the source of truth.

## Topology — 3 clients → 2 services → 1 storage

```
Claude  ──MCP (HTTP, Supabase JWT)──►  apps/mcp   ┐
Web     ──REST (Supabase JWT)───────►  apps/api   ├─► packages/shared (VaultFS) ─► Postgres + S3
                                       converter ─┘        (RLS · PGroonga FTS)
```

## Monorepo (pnpm workspaces)

| Package | Role |
|---|---|
| `packages/shared` | `config` · `db` (pg pool + RLS) · `auth` (Supabase JWKS) · `s3` · `chunker` · `references` · `PostgresVaultFS` |
| `apps/mcp` | Hosted MCP server (Hono + `@modelcontextprotocol/sdk` web-standard transport). Tools: `guide`, `list_knowledge_bases`, `create_knowledge_base`, `search`, `read`, `create`, `edit`, `append`, `delete`, `lint` |
| `apps/api` | REST for the web app: knowledge-bases, documents, graph, upload (ingest) |
| `apps/converter` | PDF/Office → markdown via the opendataloader Java CLI (`@opendataloader/pdf`) + LibreOffice. Pure Node, no Python |
| `apps/web` | Next.js: Supabase Auth, KB list, wiki browse (markdown), knowledge graph |

## Data flow

**Ingest** (`apps/api` → `apps/converter`): upload → S3 → (PDF/Office) converter → chunk → index.
Text/markdown is indexed directly. Source of truth is Postgres; S3 holds binary assets.

**Synthesis** (Claude over MCP): Claude `search`/`read`s sources, then `create`/`edit`/`append`s
wiki pages. Every write parses citations + wiki links into the `document_references` graph and
surfaces the impact (which pages reference the one just edited). There is **no backend LLM call**.

## Dependency rules

- `apps/*` depend on `packages/shared`; never the reverse.
- All DB access goes through `packages/shared/db`:
  - `scoped*` — runs as the `authenticated` role with the request's JWT claims (`set_config('request.jwt.claims')`); **RLS isolates each user**.
  - `service*` — owner role, RLS-bypassing, for cross-user system ops only.
- All S3 access goes through `S3Service`.

## Database

Supabase migrations `001`–`004` + `008` (core: users, api_keys, knowledge_bases, documents,
document_pages, document_chunks, document_references, notify trigger, kb kind) + `009`
(documents unique-active index). Migrations `005`/`006`/`007` (highlights, KB sharing,
annotation search) are intentionally **not** adopted. Full-text search uses the PGroonga
`&@~` operator on `document_chunks.content`.

## Technology Stack

- **Runtime:** Node.js ≥ 22 (ESM, TypeScript)
- **Backend framework:** Hono (portable to Cloudflare Workers)
- **DB / auth / storage:** Postgres + PGroonga, Supabase Auth (ES256 JWT), S3-compatible (Supabase Storage)
- **Converter engines:** opendataloader Java CLI (needs a JVM) + LibreOffice (Office only)
- **Verification:** Vitest (integration tests run against a local Supabase stack)
