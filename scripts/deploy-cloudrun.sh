#!/usr/bin/env bash
# Guarded Cloud Run deploy for the team-kms demo. Pins project + region, uses the
# isolated ./.gcloud login (Option 2), builds amd64 images locally, pushes to
# Artifact Registry, and deploys converter -> api -> web. Runtime env comes from
# an allowlist of .env.cloud (B-cloud); NEVER injects .env creds or NEXT_PUBLIC.
#
# Stages (run in order; re-run a single stage to iterate on failure):
#   scripts/deploy-cloudrun.sh setup       # AR repo + docker auth
#   scripts/deploy-cloudrun.sh converter
#   scripts/deploy-cloudrun.sh api
#   scripts/deploy-cloudrun.sh web
#   scripts/deploy-cloudrun.sh all         # setup -> converter -> api -> web
#   scripts/deploy-cloudrun.sh urls        # print current service URLs
set -euo pipefail

PROJECT="hardy-thinker-257409"
REGION="asia-northeast1"
REPO="team-kms"                     # Artifact Registry repo
AR="$REGION-docker.pkg.dev/$PROJECT/$REPO"

ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
export CLOUDSDK_CONFIG="$ROOT/.gcloud"     # isolated login (never global)
get_cloud() { grep -E "^$1=" .env.cloud 2>/dev/null | tail -1 | cut -d= -f2-; }

# ── Guard: gcloud must be logged in and pinned to the expected project ───────
acct="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
[ -n "$acct" ] || { echo "❌ No active gcloud login in $CLOUDSDK_CONFIG. Run: gcloud auth login" >&2; exit 1; }
gcloud config set project "$PROJECT" >/dev/null 2>&1
echo "✓ gcloud: $acct @ $PROJECT ($REGION)"

svc_url() { gcloud run services describe "$1" --region "$REGION" --format='value(status.url)' 2>/dev/null; }

# ── Build an env-vars YAML from an allowlist of .env.cloud (avoids comma issues) ─
ENV_ALLOW="DATABASE_URL DATABASE_LISTEN_URL SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_BUCKET S3_ENDPOINT CONVERTER_SECRET LIBREOFFICE_BIN MAX_IMAGE_BYTES MAX_IMAGES_PER_PAGE OCR_PROVIDER MISTRAL_API_KEY GEMINI_API_KEY GEMINI_MODEL"
gen_env_yaml() {
  local out="$1"; : > "$out"
  local k v
  for k in $ENV_ALLOW; do
    v="$(get_cloud "$k")"
    [ -n "$v" ] || continue
    # single-quote YAML value; escape any embedded single quote
    printf "%s: '%s'\n" "$k" "${v//\'/\'\'}" >> "$out"
  done
}

stage_setup() {
  gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
    || gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" \
         --description="team-kms images"
  gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
  echo "✓ Artifact Registry $REPO ready; docker authed."
}

stage_converter() {
  echo "🔨 build+push converter (amd64)…"
  docker buildx build --platform linux/amd64 -f apps/converter/Dockerfile -t "$AR/converter:latest" . --push
  local envf; envf="$(mktemp)"; gen_env_yaml "$envf"
  echo "🚀 deploy converter…"
  gcloud run deploy team-kms-converter --image "$AR/converter:latest" --region "$REGION" \
    --allow-unauthenticated --ingress internal \
    --memory 2Gi --cpu 2 --concurrency 2 --min-instances 1 --timeout 300 \
    --env-vars-file "$envf"
  rm -f "$envf"
  echo "✓ converter: $(svc_url team-kms-converter)"
}

stage_api() {
  echo "🔨 build+push api image (root Dockerfile, amd64)…"
  docker buildx build --platform linux/amd64 -f Dockerfile -t "$AR/api:latest" . --push
  local conv; conv="$(svc_url team-kms-converter)"
  [ -n "$conv" ] || { echo "❌ converter not deployed yet — run the converter stage first." >&2; exit 1; }
  local envf; envf="$(mktemp)"; gen_env_yaml "$envf"
  printf "CONVERTER_URL: '%s'\n" "$conv" >> "$envf"   # deploy-output, injected here
  echo "🚀 deploy api…"
  gcloud run deploy team-kms-api --image "$AR/api:latest" --region "$REGION" \
    --allow-unauthenticated --session-affinity \
    --command node --args apps/api/dist/index.js \
    --memory 1Gi --timeout 300 \
    --env-vars-file "$envf"
  rm -f "$envf"
  echo "✓ api: $(svc_url team-kms-api)"
}

stage_web() {
  local api; api="$(svc_url team-kms-api)"
  [ -n "$api" ] || { echo "❌ api not deployed yet — run the api stage first." >&2; exit 1; }
  local sup anon; sup="$(get_cloud SUPABASE_URL)"; anon="$(get_cloud SUPABASE_ANON_KEY)"
  echo "🔨 build+push web (NEXT_PUBLIC baked: api=$api)…"
  docker buildx build --platform linux/amd64 -f Dockerfile \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="$sup" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$anon" \
    --build-arg NEXT_PUBLIC_API_URL="$api" \
    -t "$AR/web:latest" . --push
  echo "🚀 deploy web…"
  gcloud run deploy team-kms-web --image "$AR/web:latest" --region "$REGION" \
    --allow-unauthenticated \
    --command /bin/sh --args "-c,cd /app/apps/web && exec pnpm start" \
    --memory 512Mi
  echo "✓ web: $(svc_url team-kms-web)"
}

stage_urls() {
  for s in team-kms-converter team-kms-api team-kms-web; do
    printf "  %-22s %s\n" "$s" "$(svc_url "$s" || echo '(not deployed)')"
  done
}

case "${1:-}" in
  setup)     stage_setup ;;
  converter) stage_converter ;;
  api)       stage_api ;;
  web)       stage_web ;;
  urls)      stage_urls ;;
  all)       stage_setup; stage_converter; stage_api; stage_web; echo "── URLs ──"; stage_urls ;;
  *) echo "usage: $0 {setup|converter|api|web|all|urls}" >&2; exit 2 ;;
esac
