#!/usr/bin/env bash
# Builds the public (browser data) site and deploys it to Cloudflare Pages.
# Usage: npm run deploy:static            (build, check, deploy, verify the live site)
#        npm run deploy:static -- --dry-run   (everything except the upload)
# Steps and one-time setup: docs/deploy-static.md
#
# Settings (environment variables, all optional):
#   DEPLOY_BRANCH          git branch to deploy from            (default: dev)
#   PAGES_PROJECT          Cloudflare Pages project name        (default: tracker-suite)
#   SITE_URL               public address checked after deploy  (default: https://danmuck.dev)
#   CLOUDFLARE_ACCOUNT_ID  asked for if not set (not a secret)
#   CLOUDFLARE_API_TOKEN   asked for if not set, without echo; never written to disk
set -euo pipefail

DEPLOY_BRANCH="${DEPLOY_BRANCH:-dev}"
PAGES_PROJECT="${PAGES_PROJECT:-tracker-suite}"
SITE_URL="${SITE_URL:-https://danmuck.dev}"
SITE_URL="${SITE_URL%/}"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mDeploy stopped: %s\033[0m\n' "$1" >&2; exit 1; }

# The CSP of one path from a headers block: `_headers` file or `curl -sI` output.
csp_in_headers_file() { awk -v p="$1" '$0 == p {f=1; next} f && /Content-Security-Policy:/ {sub(/^[ \t]*Content-Security-Policy:[ \t]*/, ""); print; exit} f && /^[^ \t]/ {f=0}' out/_headers; }
csp_live() { curl -sSI --max-time 15 "$SITE_URL$1" | tr -d '\r' | awk 'tolower($0) ~ /^content-security-policy:/ {sub(/^[^:]*:[ \t]*/, ""); print; exit}'; }

step "Checking the code to deploy"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "$DEPLOY_BRANCH" ] || fail "on branch '$branch'; switch to '$DEPLOY_BRANCH' (git switch $DEPLOY_BRANCH)"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes; commit or stash them so the site matches a commit"
git fetch --quiet origin "$DEPLOY_BRANCH"
local_rev="$(git rev-parse HEAD)"
remote_rev="$(git rev-parse "origin/$DEPLOY_BRANCH")"
if [ "$local_rev" != "$remote_rev" ]; then
  if git merge-base --is-ancestor HEAD "origin/$DEPLOY_BRANCH"; then
    fail "'$DEPLOY_BRANCH' is behind origin; run: git pull"
  else
    fail "'$DEPLOY_BRANCH' has commits that are not on origin; push them first (only reviewed, pushed code goes live)"
  fi
fi
commit="$(git rev-parse --short HEAD)"
echo "Deploying $DEPLOY_BRANCH at $commit: $(git log -1 --format=%s)"

step "Installing exact dependencies (npm ci)"
npm ci --no-audit --no-fund

step "Running tests"
test_log="$(mktemp)"
npm test >"$test_log" 2>&1 || { tail -40 "$test_log"; rm -f "$test_log"; fail "tests failed"; }
grep -E '^ℹ (tests|pass|fail) ' "$test_log" || true
rm -f "$test_log"

step "Auditing production dependencies"
npm audit --omit=dev || fail "npm audit found vulnerable production dependencies"

step "Building the static site"
rm -rf out
npm run build:static
# next build sometimes rewrites tsconfig.json; keep the tree identical to the commit.
git checkout --quiet -- tsconfig.json 2>/dev/null || true

step "Checking the build output"
[ -f out/_headers ] || fail "out/_headers is missing"
[ ! -e out/api ] || fail "out/api exists: server routes leaked into the static build"
[ -z "$(find out -name '*.map' -print -quit)" ] || fail "source maps found in out/"
if grep -rlE 'mongodb(\+srv)?://|MONGODB_URI' out >/dev/null; then fail "database settings found in out/"; fi
for f in .env .env.local .env.production; do
  [ -f "$f" ] || continue
  while IFS= read -r value; do
    [ "${#value}" -ge 8 ] || continue
    if grep -rqF -- "$value" out; then fail "a value from $f appears in out/"; fi
  done < <(sed -nE 's/^[A-Za-z_][A-Za-z0-9_]*=//p' "$f" | tr -d '"'"'")
done
root_csp="$(csp_in_headers_file /)"
[ -n "$root_csp" ] || fail "no Content-Security-Policy for / in out/_headers"
echo "pages: $(find out -name '*.html' | wc -l | tr -d ' '), files: $(find out -type f | wc -l | tr -d ' '), size: $(du -sh out | cut -f1)"

if [ "$DRY_RUN" = 1 ]; then
  step "Dry run: not uploading"
  echo "Build in out/ is ready. Preview it with: npm run preview:static (restart it after every build)"
  exit 0
fi

step "Cloudflare credentials"
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  read -r -p "Cloudflare account ID: " CLOUDFLARE_ACCOUNT_ID
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  read -r -s -p "Cloudflare API token (input hidden): " CLOUDFLARE_API_TOKEN
  echo
fi
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] && [ -n "$CLOUDFLARE_API_TOKEN" ] || fail "account ID and token are required"
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
export WRANGLER_SEND_METRICS=false

read -r -p "Deploy $commit to $SITE_URL (project $PAGES_PROJECT)? [y/N] " answer
case "$answer" in y|Y|yes|YES) ;; *) fail "cancelled" ;; esac

step "Uploading to Cloudflare Pages"
npx wrangler pages deploy out \
  --project-name "$PAGES_PROJECT" \
  --branch main \
  --commit-hash "$(git rev-parse HEAD)" \
  --commit-message "$DEPLOY_BRANCH $commit" \
  --commit-dirty=false
unset CLOUDFLARE_API_TOKEN

step "Checking the live site"
live=""
for _ in $(seq 1 24); do
  live="$(csp_live / || true)"
  [ "$live" = "$root_csp" ] && break
  sleep 5
done
[ "$live" = "$root_csp" ] || fail "$SITE_URL/ is not serving this build's security policy after 2 minutes; check the Pages dashboard"
echo "$SITE_URL/ serves this build"

ok=1
check() { # path, expected status
  local got; got="$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' "$SITE_URL$1")"
  if [ "$got" = "$2" ]; then echo "  $1 -> $got"; else echo "  $1 -> $got (expected $2)"; ok=0; fi
}
for page in $(cd out && find . -name '*.html' ! -name '404.html' ! -name '_not-found.html' | sed -e 's#^\.##' -e 's#/index\.html$#/#' -e 's#\.html$##' | sort); do
  check "$page" 200
done
check /api/accounts 404
headers="$(curl -sSI --max-time 15 "$SITE_URL/" | tr -d '\r' | tr 'A-Z' 'a-z')"
for h in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy cross-origin-opener-policy; do
  if printf '%s\n' "$headers" | grep -q "^$h:"; then echo "  header $h present"; else echo "  header $h MISSING"; ok=0; fi
done
[ "$ok" = 1 ] || fail "some live checks failed (see above)"

printf '\n\033[32mDeployed %s (%s) to %s\033[0m\n' "$commit" "$DEPLOY_BRANCH" "$SITE_URL"
