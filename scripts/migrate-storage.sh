#!/usr/bin/env bash
# One-time Storage migration: copy the single owner's original uploaded files from
# the local Supabase Storage bucket to the hosted one, REWRITING the top-level
# key prefix from the local owner user_id to the shared demo account UUID (task
# 4.5). The download key is built at runtime as `${userId}/${doc.id}/source.ext`,
# so after the content remap the files must live under the NEW user_id prefix.
# Orphan objects under other prefixes are intentionally skipped.
#
# Prereqs (manual, do first):
#   1. Local Supabase running (supabase start).
#   2. Content already migrated (scripts/migrate-content.sh) — same SHARED_UUID.
#   3. Hosted bucket "team-kms-assets" created (Dashboard -> Storage -> New bucket,
#      name team-kms-assets, Private — the app serves via signed URLs).
#   4. Hosted S3 access keys (Dashboard -> Project Settings -> Storage -> S3 access
#      keys). Endpoint https://<ref>.supabase.co/storage/v1/s3.
#
# Usage:
#   REMOTE_S3_ENDPOINT="https://fhgdrenwxfpandvpfsxq.supabase.co/storage/v1/s3" \
#   REMOTE_S3_ACCESS_KEY_ID="..." REMOTE_S3_SECRET_ACCESS_KEY="..." \
#   REMOTE_S3_REGION="ap-northeast-2" SHARED_UUID="<auth-uuid>" \
#   scripts/migrate-storage.sh --dry-run
#   scripts/migrate-storage.sh
set -euo pipefail

EXPECTED_REF="fhgdrenwxfpandvpfsxq"
BUCKET="team-kms-assets"
LOCAL_ENDPOINT="${LOCAL_S3_ENDPOINT:-http://127.0.0.1:54321/storage/v1/s3}"

ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
DRY=""; [[ "${1:-}" == "--dry-run" ]] && DRY="--dryrun"
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }

LOCAL_DB_URL="${LOCAL_DB_URL:-$(get_env DATABASE_URL)}"
: "${REMOTE_S3_ENDPOINT:?set REMOTE_S3_ENDPOINT to https://<ref>.supabase.co/storage/v1/s3}"
: "${REMOTE_S3_ACCESS_KEY_ID:?set REMOTE_S3_ACCESS_KEY_ID from hosted S3 access keys}"
: "${REMOTE_S3_SECRET_ACCESS_KEY:?set REMOTE_S3_SECRET_ACCESS_KEY from hosted S3 access keys}"
REMOTE_S3_REGION="${REMOTE_S3_REGION:?set REMOTE_S3_REGION to the project region}"
: "${SHARED_UUID:?set SHARED_UUID to the shared demo account auth UUID}"

# ── Guard: hosted endpoint must target the pinned project ────────────────────
if [[ "$REMOTE_S3_ENDPOINT" != *"$EXPECTED_REF"* ]]; then
  echo "❌ REMOTE_S3_ENDPOINT does not target $EXPECTED_REF. Aborting." >&2; exit 1
fi

# ── Guard: local content must be single-owner; detect the owner prefix ───────
owners=$(psql "$LOCAL_DB_URL" -tAc "select count(distinct user_id) from documents;")
if [[ "$owners" != "1" ]]; then
  echo "❌ Local documents have $owners distinct owners; expected 1. Aborting." >&2; exit 1
fi
OLD_UUID=$(psql "$LOCAL_DB_URL" -tAc "select distinct user_id from documents;")
echo "✓ Hosted targets $EXPECTED_REF; remap prefix $OLD_UUID/ → $SHARED_UUID/"

TMP="$(mktemp -d -t kms-assets.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# ── 1. Download only the owner subtree (drops the OLD prefix into $TMP) ───────
AWS_ACCESS_KEY_ID="$(get_env AWS_ACCESS_KEY_ID)" \
AWS_SECRET_ACCESS_KEY="$(get_env AWS_SECRET_ACCESS_KEY)" \
AWS_REGION=local \
  aws s3 sync "s3://$BUCKET/$OLD_UUID/" "$TMP" --endpoint-url "$LOCAL_ENDPOINT"
n=$(find "$TMP" -type f | wc -l)
echo "✓ Downloaded ${n// /} owner objects."

# ── 2. Upload under the NEW prefix ───────────────────────────────────────────
AWS_ACCESS_KEY_ID="$REMOTE_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$REMOTE_S3_SECRET_ACCESS_KEY" \
AWS_REGION="$REMOTE_S3_REGION" \
  aws s3 sync "$TMP" "s3://$BUCKET/$SHARED_UUID/" --endpoint-url "$REMOTE_S3_ENDPOINT" $DRY
[[ -n "$DRY" ]] && echo "🧪 --dry-run: nothing uploaded." || echo "✓ Uploaded ${n// /} objects under $SHARED_UUID/."
