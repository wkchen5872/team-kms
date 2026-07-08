#!/usr/bin/env bash
# One-time content migration: local Supabase → hosted (Plan A: single shared owner).
#
# Dumps the app content (data-only), remaps the single local owner's user_id to the
# hosted shared demo account's auth UUID, and restores into the PINNED hosted
# project. Guards against (a) targeting the wrong project and (b) local data that
# is NOT single-owner. Idempotency is NOT guaranteed — run once into a fresh DB.
#
# Prereqs (manual, do first):
#   1. Hosted migrations applied:            scripts/supabase-push.sh
#   2. Local Supabase running:               supabase start
#   3. Shared demo account created in hosted Auth (Dashboard → Authentication →
#      Add user). Copy its User UID → that is SHARED_UUID below.
#   4. `psql` and `pg_dump` on PATH (Postgres client).
#
# Connection: REMOTE_DB_URL must be the hosted **Session pooler** or **Direct**
# connection (Dashboard → Settings → Database → Connection string), NOT the
# transaction pooler (COPY/multi-statement restore needs a session).
#
# Usage:
#   REMOTE_DB_URL="postgresql://postgres.<ref>:<pw>@<session-pooler-host>:5432/postgres" \
#   SHARED_UUID="<auth-user-uuid>" \
#   [SHARED_EMAIL="demo@example.com"] \
#   scripts/migrate-content.sh --dry-run     # dump + remap only, no restore
#   scripts/migrate-content.sh               # full run
set -euo pipefail

EXPECTED_REF="fhgdrenwxfpandvpfsxq"
# FK-dependency order (pg_dump also orders, but list scopes the dump).
TABLES=(knowledge_bases documents document_raw document_pages document_chunks document_references)

ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
DRY_RUN=0; [[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }

LOCAL_DB_URL="${LOCAL_DB_URL:-$(get_env DATABASE_URL)}"
: "${REMOTE_DB_URL:?set REMOTE_DB_URL to the hosted session/direct connection string}"
: "${SHARED_UUID:?set SHARED_UUID to the hosted shared demo account auth UUID}"
SHARED_EMAIL="${SHARED_EMAIL:-demo@team-kms.local}"

# ── Guard 1: remote must be the pinned project ───────────────────────────────
if [[ "$REMOTE_DB_URL" != *"$EXPECTED_REF"* ]]; then
  echo "❌ REMOTE_DB_URL does not target $EXPECTED_REF. Aborting." >&2; exit 1
fi
echo "✓ Remote targets $EXPECTED_REF."

# ── Guard 2: local content must be single-owner (Plan A) ─────────────────────
owners=$(psql "$LOCAL_DB_URL" -tAc "select count(distinct user_id) from documents;")
if [[ "$owners" != "1" ]]; then
  echo "❌ Local documents have $owners distinct owners; Plan A expects 1. Aborting." >&2
  exit 1
fi
LOCAL_UUID=$(psql "$LOCAL_DB_URL" -tAc "select distinct user_id from documents;")
echo "✓ Single local owner $LOCAL_UUID → remap to $SHARED_UUID"

# ── Dump (data-only) + remap the owner UUID everywhere ───────────────────────
DUMP="$(mktemp -t kms-content.XXXXXX).sql"
# shellcheck disable=SC2046
pg_dump "$LOCAL_DB_URL" --data-only --no-owner $(printf ' --table=%s' "${TABLES[@]}") > "$DUMP"
# UUIDs are globally-unique tokens, so a literal replace is safe.
sed -i.bak "s/$LOCAL_UUID/$SHARED_UUID/g" "$DUMP" && rm -f "$DUMP.bak"
lines=$(wc -l < "$DUMP")
echo "✓ Dumped ${lines// /} lines; owner UUID remapped."

if [[ "$DRY_RUN" == "1" ]]; then
  echo "🧪 --dry-run: dump ready at $DUMP (NOT restored). Inspect it, then re-run without --dry-run."
  exit 0
fi

# ── Ensure the shared owner row exists (FK target), then restore ─────────────
psql "$REMOTE_DB_URL" -v ON_ERROR_STOP=1 -c \
  "insert into users(id,email) values ('$SHARED_UUID','$SHARED_EMAIL') on conflict (id) do nothing;"
psql "$REMOTE_DB_URL" -v ON_ERROR_STOP=1 < "$DUMP"

# ── Verify row counts match ──────────────────────────────────────────────────
echo "📊 Row-count check (local vs remote):"
ok=1
for t in "${TABLES[@]}"; do
  l="$(psql "$LOCAL_DB_URL"  -tAc "select count(*) from $t;")"
  r="$(psql "$REMOTE_DB_URL" -tAc "select count(*) from $t;")"
  mark="✓"; [[ "$l" != "$r" ]] && { mark="✗"; ok=0; }
  printf "  %-22s local=%-6s remote=%-6s %s\n" "$t" "$l" "$r" "$mark"
done
rm -f "$DUMP"
[[ "$ok" == "1" ]] && echo "✓ Content migration complete." || { echo "❌ Row counts differ." >&2; exit 1; }
