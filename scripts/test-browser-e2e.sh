#!/usr/bin/env bash
set -euo pipefail

base_dir=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$base_dir/package.json').version")
plugin_zip=${GUYAMAP_TEST_PLUGIN_ZIP:-"$base_dir/dist/yamap-block-gutenberg-$version.zip"}
wp_version=${GUYAMAP_TEST_WP_VERSION:-7.1.4}
port=${GUYAMAP_E2E_PORT:-8894}
mode=${1:-deterministic}
base_url="http://127.0.0.1:${port}"
[[ -f "$plugin_zip" ]] || { printf 'Build the release ZIP before browser tests.\n' >&2; exit 1; }
if [[ "$mode" == real && -z "${GUYAMAP_E2E_YANDEX_API_KEY:-}" ]]; then
    printf 'Real Yandex SDK checks NOT EXECUTED: GUYAMAP_E2E_YANDEX_API_KEY is not configured.\n' >&2
    exit 78
fi
[[ "$mode" == deterministic || "$mode" == real ]] || { printf 'Usage: %s [deterministic|real]\n' "$0" >&2; exit 2; }
command -v wp >/dev/null 2>&1 || { printf 'WP-CLI is required.\n' >&2; exit 1; }
site_dir=$(mktemp -d /tmp/guyamap-browser.XXXXXXXX)
task_id=${site_dir##*.}
database="guyamap_browser_${task_id,,}"
database_created=false
server_pid=''
wp_cli=(wp --path="$site_dir" --no-color)
cleanup() {
    local result=$?
    trap - EXIT
    if [[ -n "$server_pid" ]]; then
        kill -- "-$server_pid" >/dev/null 2>&1 || true
        wait "$server_pid" >/dev/null 2>&1 || true
    fi
    if [[ "$database_created" == true && "$database" =~ ^guyamap_browser_[a-z0-9]+$ ]]; then
        "${wp_cli[@]}" db drop --yes >/dev/null 2>&1 || result=1
    fi
    if [[ "$result" -ne 0 ]]; then
        printf '== browser server log (tail)\n' >&2
        tail -n 50 "$base_dir/test-results/wp-server.log" 2>/dev/null >&2 || true
        printf '== browser WordPress debug.log (tail)\n' >&2
        tail -n 50 "$site_dir/wp-content/debug.log" 2>/dev/null >&2 || true
        printf 'Temporary browser site kept for diagnosis: %s\n' "$site_dir" >&2
    else
        rm -rf "$site_dir"
    fi
    exit "$result"
}
trap cleanup EXIT

"${wp_cli[@]}" core download --version="$wp_version" --locale=en_US --quiet
printf '%s\n' "${GUYAMAP_TEST_DB_PASSWORD:-}" | "${wp_cli[@]}" config create \
    --dbname="$database" --dbuser="${GUYAMAP_TEST_DB_USER:-root}" \
    --dbhost="${GUYAMAP_TEST_DB_HOST:-localhost}" --dbprefix=guyamap_browser_ \
    --skip-check --prompt=dbpass >/dev/null
"${wp_cli[@]}" db create >/dev/null
database_created=true
for constant in WP_DEBUG WP_DEBUG_LOG DISABLE_WP_CRON; do "${wp_cli[@]}" config set "$constant" true --raw >/dev/null; done
"${wp_cli[@]}" config set WP_DEBUG_DISPLAY false --raw >/dev/null
"${wp_cli[@]}" core install --url="$base_url" --title='Yandex Maps browser test' \
    --admin_user=guyamap_admin --admin_password=local-test-password \
    --admin_email=admin@example.invalid --skip-email >/dev/null
"${wp_cli[@]}" theme install twentytwentyone --version=2.9 --quiet
"${wp_cli[@]}" plugin install "$plugin_zip" --activate >/dev/null
"${wp_cli[@]}" eval 'update_option("guyamap_settings", array("api_key" => getenv("GUYAMAP_E2E_YANDEX_API_KEY") ?: "e2e-public-browser-key", "language" => "en_US"));'
: > "$site_dir/wp-content/debug.log"
mkdir -p "$base_dir/test-results"
if curl -sS "$base_url" >/dev/null 2>&1; then
    printf 'Port %s is already in use; set GUYAMAP_E2E_PORT.\n' "$port" >&2
    exit 1
fi
(cd "$site_dir" && exec setsid env PHP_CLI_SERVER_WORKERS=1 wp --path="$site_dir" --no-color server --host=127.0.0.1 --port="$port") >"$base_dir/test-results/wp-server.log" 2>&1 &
server_pid=$!
ready=false
for _ in $(seq 1 30); do
    if curl -fsS "$base_url" >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
done
[[ "$ready" == true ]] || { printf 'The disposable WordPress server did not start.\n' >&2; exit 1; }

if [[ "$mode" == real ]]; then
    GUYAMAP_E2E_LIVE_SDK=real GUYAMAP_E2E_WP_PATH="$site_dir" GUYAMAP_E2E_BASE_URL="$base_url" npm run test:e2e
    printf 'Real Yandex SDK browser checks EXECUTED and passed.\n'
else
    GUYAMAP_E2E_WP_PATH="$site_dir" GUYAMAP_E2E_BASE_URL="$base_url" npm run test:e2e -- \
        tests/e2e/runtime-mock.spec.js tests/e2e/editor-live-preview.spec.js tests/e2e/classic-theme.spec.js tests/e2e/legacy-content.spec.js
    printf 'Deterministic mocked-SDK browser checks passed on the installed release ZIP.\n'
fi
php_problems=$(grep -E 'PHP (Warning|Notice|Deprecated|Fatal)' "$site_dir/wp-content/debug.log" 2>/dev/null || true)
if [[ -n "$php_problems" ]]; then
    printf 'PHP warnings/notices during browser tests:\n%s\n' "$php_problems" >&2
    exit 1
fi
