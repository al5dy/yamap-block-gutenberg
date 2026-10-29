#!/usr/bin/env bash
set -euo pipefail

base_dir=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$base_dir/package.json').version")
plugin_zip=${GUYAMAP_TEST_PLUGIN_ZIP:-"$base_dir/dist/yamap-block-gutenberg-$version.zip"}
wp_version=${GUYAMAP_TEST_WP_VERSION:-7.1.4}
check_version=${GUYAMAP_PLUGIN_CHECK_VERSION:-2.1.0}
[[ -f "$plugin_zip" ]] || { printf 'Build the release ZIP before Plugin Check.\n' >&2; exit 1; }
command -v wp >/dev/null 2>&1 || { printf 'WP-CLI is required.\n' >&2; exit 1; }
site_dir=$(mktemp -d /tmp/guyamap-plugin-check.XXXXXXXX)
task_id=${site_dir##*.}
database="guyamap_check_${task_id,,}"
database_created=false
wp_cli=(wp --path="$site_dir" --no-color)
cleanup() {
    local result=$?
    trap - EXIT
    if [[ "$database_created" == true && "$database" =~ ^guyamap_check_[a-z0-9]+$ ]]; then
        "${wp_cli[@]}" db drop --yes >/dev/null 2>&1 || result=1
    fi
    rm -rf "$site_dir"
    exit "$result"
}
trap cleanup EXIT

"${wp_cli[@]}" core download --version="$wp_version" --locale=en_US --quiet
printf '%s\n' "${GUYAMAP_TEST_DB_PASSWORD:-}" | "${wp_cli[@]}" config create \
    --dbname="$database" --dbuser="${GUYAMAP_TEST_DB_USER:-root}" \
    --dbhost="${GUYAMAP_TEST_DB_HOST:-localhost}" --dbprefix=guyamap_check_ \
    --skip-check --prompt=dbpass >/dev/null
"${wp_cli[@]}" db create >/dev/null
database_created=true
"${wp_cli[@]}" core install --url=http://guyamap-check.test --title='Yandex Maps Plugin Check' \
    --admin_user=guyamap_admin --admin_password=local-test-password \
    --admin_email=admin@example.invalid --skip-email >/dev/null
"${wp_cli[@]}" plugin install plugin-check --version="$check_version" --activate --quiet
"${wp_cli[@]}" plugin install "$plugin_zip" --activate >/dev/null
report=$("${wp_cli[@]}" plugin check yamap-block-gutenberg --format=csv --include-experimental 2>&1 || true)
printf '%s\n' "$report"
errors=$(grep -E '^[0-9]+,[0-9]+,ERROR,' <<<"$report" || true)
if [[ -n "$errors" ]]; then
    printf 'Plugin Check reported errors:\n%s\n' "$errors" >&2
    exit 1
fi
warnings=$(grep -E '^[0-9]+,[0-9]+,WARNING,' <<<"$report" || true)
# Reviewed compatibility warnings: the mandated public name and long-standing
# slug contain "gutenberg"; the bundled MO loader supports non-directory installs;
# the two scoped ini_set calls round-trip coordinates and restore the prior value.
unexpected=$(grep -Ev 'load_plugin_textdomainFound|^(622,35|633,5),WARNING,Squiz\.PHP\.DiscouragedFunctions\.Discouraged,|trademarked_term.*gutenberg' <<<"$warnings" || true)
if [[ -n "$unexpected" ]]; then
    printf 'Plugin Check reported unreviewed warnings:\n%s\n' "$unexpected" >&2
    exit 1
fi
if ! grep -qE '^(FILE: |Success: Checks complete)' <<<"$report"; then
    printf 'Plugin Check did not run.\n' >&2
    exit 1
fi
reviewed_count=$(grep -c . <<<"$warnings" || true)
printf 'Plugin Check passed: no errors; %s reviewed compatibility warning(s), no unreviewed warnings.\n' "$reviewed_count"
