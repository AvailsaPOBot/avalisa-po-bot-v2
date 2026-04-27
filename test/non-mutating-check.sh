#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '\n==> %s\n' "$1"
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 127
  fi
}

extract_extension_config() {
  node <<'NODE'
const fs = require('fs');
const path = require('path');
const config = fs.readFileSync(path.join(process.cwd(), 'extension', 'config.js'), 'utf8');

function readConst(name) {
  const match = config.match(new RegExp(`const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`));
  if (!match) {
    throw new Error(`Unable to find ${name} in extension/config.js`);
  }
  return match[1];
}

console.log(`API_BASE=${readConst('API_BASE')}`);
console.log(`DASHBOARD_URL=${readConst('DASHBOARD_URL')}`);
NODE
}

check_extension_manifest() {
  node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const manifestPath = path.join(root, 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const missing = [];

function assertFile(relativePath) {
  const fullPath = path.join(root, 'extension', relativePath);
  if (!fs.existsSync(fullPath)) {
    missing.push(relativePath);
  }
}

for (const script of manifest.content_scripts || []) {
  for (const js of script.js || []) assertFile(js);
}
if (manifest.background?.service_worker) assertFile(manifest.background.service_worker);
for (const icon of Object.values(manifest.icons || {})) assertFile(icon);
for (const icon of Object.values(manifest.action?.default_icon || {})) assertFile(icon);

if (missing.length) {
  throw new Error(`Missing extension files referenced by manifest: ${missing.join(', ')}`);
}
NODE
}

check_url() {
  local label="$1"
  local url="$2"
  printf '+ curl %s\n' "$url"
  local status
  status="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 30 "$url")"
  case "$status" in
    2*|3*) printf '%s reachable: HTTP %s\n' "$label" "$status" ;;
    *) printf '%s failed: HTTP %s (%s)\n' "$label" "$status" "$url" >&2; return 1 ;;
  esac
}

require_cmd node
require_cmd npm
require_cmd curl

cd "$ROOT"

log "Validate extension syntax"
find "$ROOT/extension" -maxdepth 1 -type f -name '*.js' | sort | while IFS= read -r file; do
  run node --check "$file"
done
run check_extension_manifest

log "Generate backend Prisma client"
(cd "$ROOT/backend" && run npm run db:generate)

log "Run dashboard CI tests"
(cd "$ROOT/dashboard" && CI=true run npm test -- --watchAll=false)

log "Build dashboard"
(cd "$ROOT/dashboard" && CI=true run npm run build)

log "Check live public reachability"
eval "$(extract_extension_config)"
check_url "Dashboard" "$DASHBOARD_URL"
check_url "Backend health" "$API_BASE/health"
check_url "Backend public config" "$API_BASE/api/config/affiliate-link"

printf '\nNon-mutating replacement check passed.\n'
