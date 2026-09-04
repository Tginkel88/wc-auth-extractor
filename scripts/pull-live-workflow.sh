#!/usr/bin/env bash
# Read-only dump of the Radius PT Gravity Rail fax-intake graph.
# Requires: gr (npm i -g @gravity-rail/cli), and either `gr login --env prod`
# or GRAVITY_RAIL_API_KEY.
#
# Does NOT dump fax payloads, OCR text, or data-record field values (PHI).

set -euo pipefail

ENV="${GRAVITY_RAIL_ENV:-prod}"
WID="${GRAVITY_RAIL_WORKSPACE:-41c74e68-2010-4ee1-88d6-6eb724ac14d3}"
OUT="${1:-./gravity-rail-live-pull}"

if ! command -v gr >/dev/null 2>&1; then
  echo "gr not found. Install: npm install -g @gravity-rail/cli" >&2
  exit 1
fi

mkdir -p "$OUT"

run() {
  local name="$1"
  shift
  echo "→ $name"
  if ! gr --env "$ENV" -w "$WID" -o json "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"; then
    echo "  failed (see $OUT/$name.err)"
  fi
}

echo "Gravity Rail live pull  env=$ENV  workspace=$WID  out=$OUT"
gr --env "$ENV" whoami -o json >"$OUT/whoami.json" || {
  echo "Not authenticated. Run: gr login --env prod" >&2
  echo "Or: export GRAVITY_RAIL_API_KEY=..." >&2
  exit 1
}

run workspaces workspaces list
run workflows workflows list
run tasks tasks list
run agents agents list
run data-types data-types list
run fax-summaries-schema data-types get-by-slug --slug fax_summaries
run event-rules events rules list
run event-rule-types events rules types
run toolkits toolkits list
run inboxes inboxes list
run phone-numbers phone-numbers list
run documo-status documo-fax status
run app-connections app-connections list
run support-requests support list
run qualifications qualifications list

echo
echo "Done. PHI-safe JSON is in $OUT/"
echo "Next (manual, may include PHI — do not commit):"
echo "  gr --env $ENV -w $WID workflows diagram --id <id> -o json"
echo "  gr --env $ENV -w $WID prompts inspect --task-id <starting_task>"
echo "  gr --env $ENV -w $WID events rules executions --rule-id <email_send_rule>"
echo "  gr --env $ENV support get --id b5cdcd04-e11a-4706-8f97-5e807f97f448 -o json"
