#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f ".gas-deploy.env" ]]; then
  source ".gas-deploy.env"
fi

MSG="${1:-Deploy $(date '+%Y-%m-%d %H:%M:%S')}"
if [[ -z "${GAS_DEPLOYMENT_ID:-}" ]]; then
  echo "GAS_DEPLOYMENT_ID 누락"
  exit 1
fi

echo "[1/3] push"
clasp push --force

echo "[2/3] version"
OUT="$(clasp version "$MSG")"
echo "$OUT"
VER="$(echo "$OUT" | grep -Eo '[0-9]+' | tail -1)"

echo "[3/3] deploy"
clasp deploy --deploymentId "$GAS_DEPLOYMENT_ID" --description "$MSG" --versionNumber "$VER"

if [[ -n "${GAS_HEALTHCHECK_URL:-}" ]]; then
  echo "[health] $GAS_HEALTHCHECK_URL"
  curl -sS -L --max-time "${GAS_HEALTH_TIMEOUT:-20}" "$GAS_HEALTHCHECK_URL" | head -c 300; echo
fi

echo "완료: version $VER"
