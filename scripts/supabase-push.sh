#!/usr/bin/env bash
# Guarded Supabase link + db push. Pins the ONE project this repo may touch and
# refuses to run against any other account/project — so you can't push to the
# wrong place. Uses the project-scoped SUPABASE_ACCESS_TOKEN from .env, never a
# global `supabase login`.
#
# Usage:
#   scripts/supabase-push.sh            # link (if needed) + push
#   scripts/supabase-push.sh --dry-run  # verify targeting only, no push
#
# To change the target project you must EDIT EXPECTED_REF below — deliberate
# friction is the point.
set -euo pipefail

# ── The only project this repo is allowed to push to ─────────────────────────
EXPECTED_REF="fhgdrenwxfpandvpfsxq"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# ── Read a single key from .env without executing arbitrary shell ────────────
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }

# 1. Project-scoped token (env wins; else .env). Never fall back to global login.
export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(get_env SUPABASE_ACCESS_TOKEN)}"
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "❌ SUPABASE_ACCESS_TOKEN not set. Put it in .env (project-scoped token)." >&2
  exit 1
fi

# 2. Guard: the active token must actually see EXPECTED_REF (right account).
if ! supabase projects list 2>/dev/null | grep -q "$EXPECTED_REF"; then
  echo "❌ This token cannot see project $EXPECTED_REF — wrong account/token." >&2
  echo "   Projects this token sees:" >&2
  supabase projects list >&2 || true
  exit 1
fi
echo "✓ Token can see $EXPECTED_REF (correct account)."

# 3. Link if not already linked to EXPECTED_REF.
linked() { cat supabase/.temp/project-ref 2>/dev/null || true; }
if [[ "$(linked)" != "$EXPECTED_REF" ]]; then
  echo "🔗 Linking to $EXPECTED_REF ..."
  # Optional non-interactive DB password from .env; else supabase link prompts.
  db_pw="$(get_env SUPABASE_DB_PASSWORD)"
  if [[ -n "$db_pw" ]]; then
    supabase link --project-ref "$EXPECTED_REF" --password "$db_pw"
  else
    supabase link --project-ref "$EXPECTED_REF"
  fi
fi

# 4. Final guard: linked ref MUST equal EXPECTED_REF before any mutation.
if [[ "$(linked)" != "$EXPECTED_REF" ]]; then
  echo "❌ Linked ref '$(linked)' != expected '$EXPECTED_REF'. Aborting." >&2
  exit 1
fi
echo "✓ Linked to $EXPECTED_REF."

# 5. Show pending migrations; push (unless --dry-run).
echo "📋 Migration status:"
supabase migration list || true
if [[ "$DRY_RUN" == "1" ]]; then
  echo "🧪 --dry-run: targeting verified, skipping db push."
  exit 0
fi
echo "🚀 Pushing migrations to $EXPECTED_REF ..."
supabase db push
echo "✓ Done."
