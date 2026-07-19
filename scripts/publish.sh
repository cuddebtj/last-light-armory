#!/usr/bin/env bash
# Publish flow (see CLAUDE.md's "Publish Flow" section): run ingest's
# cmd/export against the live (private-network) Postgres, copy the fresh
# JSON into web/data/, sanity-check the site still builds and passes its
# tests against that data, then commit and push — on a fresh branch, never
# directly to the base branch. Opening/merging the resulting PR is left to
# a human (or an explicit follow-up command); this script never merges.
#
# Usage:
#   ./scripts/publish.sh
#
# Env vars:
#   INGEST_REPO      Path to last-light-armory-ingest. Default: sibling
#                     directory ../last-light-armory-ingest.
#   BASE_BRANCH       Branch this must be run from (and branches off of).
#                     Default: dev.
#   PUBLISH_NO_PUSH   If set (any value), do everything except the final
#                     `git push` — useful to inspect the resulting branch
#                     and commit locally before deciding to push.
#
# Exit codes: 0 success (including "nothing to publish"), 1 any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INGEST_REPO="${INGEST_REPO:-$REPO_ROOT/../last-light-armory-ingest}"
BASE_BRANCH="${BASE_BRANCH:-dev}"

log() { printf '==> %s\n' "$1"; }
fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

cd "$REPO_ROOT"

# --- Preflight -------------------------------------------------------------

command -v go >/dev/null 2>&1 || fail "go not found on PATH"
command -v npm >/dev/null 2>&1 || fail "npm not found on PATH"
[ -d "$INGEST_REPO" ] || fail "INGEST_REPO not found: $INGEST_REPO"
[ -d "$INGEST_REPO/cmd/export" ] || fail "$INGEST_REPO doesn't look like last-light-armory-ingest (no cmd/export)"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$current_branch" = "$BASE_BRANCH" ] ||
  fail "must be run from '$BASE_BRANCH' (currently on '$current_branch'); checkout $BASE_BRANCH and pull first"

[ -z "$(git status --porcelain)" ] ||
  fail "working tree isn't clean; commit, stash, or discard changes first"

git fetch origin "$BASE_BRANCH" --quiet
local_rev="$(git rev-parse "$BASE_BRANCH")"
remote_rev="$(git rev-parse "origin/$BASE_BRANCH")"
[ "$local_rev" = "$remote_rev" ] ||
  fail "$BASE_BRANCH is not up to date with origin/$BASE_BRANCH; pull first"

# --- Export ------------------------------------------------------------

tmp_export="$(mktemp -d)"
trap 'rm -rf "$tmp_export"' EXIT

log "running ingest's cmd/export against the live database..."
( cd "$INGEST_REPO" && go run ./cmd/export -out "$tmp_export" )

# --- Copy into web/data/ ----------------------------------------------

log "copying export into web/data/..."
cp "$tmp_export/meta.json" web/data/meta.json
cp "$tmp_export/perks.json" web/data/perks.json
# --delete so weapons removed/renamed upstream (hash changes) don't linger
# as stale files that generateStaticParams would otherwise never revisit.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$tmp_export/weapons/" web/data/weapons/
else
  rm -rf web/data/weapons
  mkdir -p web/data/weapons
  cp -r "$tmp_export/weapons/." web/data/weapons/
fi

if [ -z "$(git status --porcelain -- web/data)" ]; then
  log "no changes — web/data/ already matches the live export. Nothing to publish."
  exit 0
fi

# --- New branch, only now that there's something to publish ------------

manifest_version="$(python3 -c 'import json; print(json.load(open("web/data/meta.json"))["manifest_version"])')"
weapon_count="$(python3 -c 'import json; print(json.load(open("web/data/meta.json"))["weapon_count"])')"
perk_count="$(python3 -c 'import json; print(json.load(open("web/data/meta.json"))["perk_count"])')"
roll_count="$(python3 -c 'import json; print(json.load(open("web/data/meta.json"))["roll_count"])')"

branch="chore/data-refresh-$(date -u +%Y%m%d-%H%M%S)"
log "changes found — branching to $branch"
git checkout -b "$branch"

# --- Safety gate: does the site still build and pass with this data? ---

log "verifying the site still builds and passes its tests against the new data..."
(
  cd web
  npm run build
  npm run test:coverage
  npm run test:e2e
) || fail "build/test failed against the refreshed data — left on branch '$branch' with the change uncommitted for you to investigate (a hardcoded count in a test, e.g. lib/data.test.ts or e2e/all-weapons.spec.ts, is the most likely cause — see CLAUDE.md's Testing Policy note on committed-export coupling)"

# --- Commit + push ------------------------------------------------------

git add web/data
git commit -m "chore(data): refresh weapon export snapshot (manifest $manifest_version)

$weapon_count weapons, $perk_count perks, $roll_count rolls, via
scripts/publish.sh."

if [ -n "${PUBLISH_NO_PUSH:-}" ]; then
  log "PUBLISH_NO_PUSH set — committed on '$branch' but not pushed."
  exit 0
fi

git push -u origin "$branch"

remote_url="$(git remote get-url origin)"
slug="$(printf '%s' "$remote_url" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')"
log "pushed. Open a PR: https://github.com/$slug/compare/$BASE_BRANCH...$branch?expand=1"
