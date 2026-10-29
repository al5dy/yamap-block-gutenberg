#!/usr/bin/env bash
set -euo pipefail

base_dir=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$base_dir/package.json').version")
plugin_zip=${GUYAMAP_TEST_PLUGIN_ZIP:-"$base_dir/dist/yamap-block-gutenberg-$version.zip"}
wp_version=${GUYAMAP_TEST_WP_VERSION:-7.1.4}
previous_version=${GUYAMAP_TEST_PREVIOUS_VERSION:-2.0.0}
[[ -f "$plugin_zip" ]] || { printf 'Build the release ZIP first: %s\n' "$plugin_zip" >&2; exit 1; }
if [[ -f "$plugin_zip.sha256" ]]; then
    (cd "$(dirname "$plugin_zip")" && sha256sum -c "$(basename "$plugin_zip").sha256" >/dev/null)
fi
command -v wp >/dev/null 2>&1 || { printf 'WP-CLI is required.\n' >&2; exit 1; }

site_dir=''
database=''
database_created=false
wp_cli=()
cleanup() {
    local result=$?
    trap - EXIT
    if [[ "$database_created" == true && "$database" =~ ^guyamap_test_[a-z0-9]+$ ]]; then
        "${wp_cli[@]}" db drop --yes >/dev/null 2>&1 || result=1
    fi
    if [[ "$result" -ne 0 && -n "$site_dir" && -f "$site_dir/wp-content/debug.log" ]]; then
        printf '== debug.log (tail)\n' >&2
        tail -n 40 "$site_dir/wp-content/debug.log" >&2 || true
    fi
    if [[ "$result" -ne 0 && -n "$site_dir" ]]; then
        printf 'Temporary smoke site kept for diagnosis: %s\n' "$site_dir" >&2
    else
        rm -rf "$site_dir"
    fi
    exit "$result"
}
trap cleanup EXIT

problems() {
    grep -E 'PHP (Warning|Notice|Deprecated|Fatal)' "$site_dir/wp-content/debug.log" 2>/dev/null || true
}

runtime_checks() {
    local expected_version=$1
    GUYAMAP_EXPECTED_VERSION="$expected_version" "${wp_cli[@]}" eval '
        $fail = static function (string $message): void { WP_CLI::error("SMOKE: " . $message); };
        $root = wp_normalize_path(WP_PLUGIN_DIR . "/yamap-block-gutenberg/");
        $data = get_plugin_data($root . "yamap-block-gutenberg.php", false, false);
        if ("Yandex Maps for Gutenberg" !== $data["Name"]) { $fail("plugin name"); }
        if (getenv("GUYAMAP_EXPECTED_VERSION") !== $data["Version"] || getenv("GUYAMAP_EXPECTED_VERSION") !== GUYAMAP_VERSION) { $fail("version"); }
        if ("https://lokotkov.dev" !== $data["AuthorURI"]) { $fail("author URI"); }
        if (wp_normalize_path(GUYAMAP_PLUGIN_PATH) !== $root) { $fail("plugin does not run from the installed ZIP"); }
        $registry = WP_Block_Type_Registry::get_instance();
        $owned = array_values(array_filter($registry->get_all_registered(), static function ($block) {
            return "gutenberg-yandex-block/map" === $block->name;
        }));
        if (1 !== count($owned)) { $fail("expected exactly one map block"); }
        $type = $owned[0];
        if ("Yandex Map" !== $type->title || 3 !== $type->api_version || ! is_callable($type->render_callback)) { $fail("block metadata or renderer"); }
        if ("A fast, accessible Yandex map with markers and clustering." !== $type->description) { $fail("block description"); }
        foreach (array("build/index.js", "build/view.js", "build/block.json", "assets/icons/fallback_24.svg", "languages/yamap-block-gutenberg-ru_RU.mo", "LICENSE", "LICENSES/Apache-2.0.txt") as $file) {
            if (! is_readable($root . $file)) { $fail("missing runtime file " . $file); }
        }
        foreach (array("tests", "scripts", "src", "docs", "vendor", "node_modules", ".github", "README.md", "package.json", "composer.json") as $development) {
            if (file_exists($root . $development)) { $fail("development file installed: " . $development); }
        }
        $settings = guyamap()->settings()->sanitize(array("api_key" => "smoke-public-key", "language" => "ru_RU"));
        update_option("guyamap_settings", $settings);
        if ("ru_RU" !== guyamap()->settings()->get_language() || "smoke-public-key" !== guyamap()->settings()->get_api_key()) { $fail("settings round trip"); }
        $render = static function (array $attrs, string $content = ""): string {
            return render_block(array("blockName" => "gutenberg-yandex-block/map", "attrs" => $attrs, "innerBlocks" => array(), "innerHTML" => $content, "innerContent" => array($content)));
        };
        $html = $render(array("center" => array("latitude" => 55.75, "longitude" => 37.61), "cluster" => array("enabled" => true, "gridSize" => 64), "markers" => array(array("id" => "office", "coordinates" => array("latitude" => 55.75, "longitude" => 37.61), "title" => "Office"))));
        if (false === strpos($html, "<guyamap-map-view ") || false === strpos($html, "application/json")) { $fail("frontend map shell"); }
        if (false === strpos($html, "Office") || false === strpos($html, "guyamap-map__noscript-fallback")) { $fail("frontend marker or fallback"); }
        $legacy_defaults = array("blockAlignment" => "", "height" => "400px", "width" => "100%", "lat" => 53.918777, "lon" => 27.562007, "pm_lat" => 53.918777, "pm_lon" => 27.562007, "pm_balloon" => "Legacy", "pm_hint" => "", "zoom" => 10, "has_placemark" => true);
        $legacy_content = "<div class=\"wp-block-gutenberg-yandex-block-map\" data-params=\"" . esc_attr(wp_json_encode($legacy_defaults)) . "\"></div>";
        $legacy = $render(array(), $legacy_content);
        if (false === strpos($legacy, "53.918777") || false === strpos($legacy, "Legacy") || false !== strpos($legacy, "invalid content")) { $fail("legacy rendering without resave"); }
        $current = $render(array("schemaVersion" => 2, "zoom" => 12, "markers" => array()));
        if (false !== strpos($current, "invalid content") || false === strpos($current, "guyamap-map-")) { $fail("2.0 content rendering"); }
        WP_CLI::success("Runtime checks passed for " . GUYAMAP_VERSION);
    '
    "${wp_cli[@]}" config set WPLANG ru_RU >/dev/null
    "${wp_cli[@]}" eval '$actual = __("Yandex Maps for Gutenberg", "yamap-block-gutenberg"); if ("Яндекс Карты для Gutenberg" !== $actual) { $translations = get_translations_for_domain("yamap-block-gutenberg"); WP_CLI::error("Russian translation did not load: locale=" . get_locale() . " actual=" . $actual . " entries=" . count($translations->entries) . " path=" . GUYAMAP_PLUGIN_PATH); } WP_CLI::success("Russian translation passed");'
    "${wp_cli[@]}" config set WPLANG en_US >/dev/null
    [[ -z "$(problems)" ]] || { printf 'PHP problems during runtime checks:\n%s\n' "$(problems)" >&2; return 1; }
}

uninstall_checks() {
    "${wp_cli[@]}" eval 'update_option("guyamap_settings", array("api_key" => "keep-me", "language" => "auto")); define("GUYAMAP_PRESERVE_DATA", true); require WP_PLUGIN_DIR . "/yamap-block-gutenberg/uninstall.php"; if ("keep-me" !== get_option("guyamap_settings")["api_key"]) { WP_CLI::error("Preserve-data uninstall failed"); }'
    "${wp_cli[@]}" plugin deactivate yamap-block-gutenberg >/dev/null
    "${wp_cli[@]}" plugin uninstall yamap-block-gutenberg >/dev/null
    [[ ! -d "$site_dir/wp-content/plugins/yamap-block-gutenberg" ]] || { printf 'Plugin files were not removed.\n' >&2; return 1; }
    "${wp_cli[@]}" eval 'if (false !== get_option("guyamap_settings", false)) { WP_CLI::error("Default uninstall did not remove settings"); } WP_CLI::success("Uninstall checks passed");'
    [[ -z "$(problems)" ]] || { printf 'PHP problems during uninstall:\n%s\n' "$(problems)" >&2; return 1; }
}

smoke_site() {
    local mode=$1
    site_dir=$(mktemp -d /tmp/guyamap-smoke.XXXXXXXX)
    local task_id=${site_dir##*.}
    database="guyamap_test_${task_id,,}"
    wp_cli=(wp --path="$site_dir" --no-color)
    printf '== %s: WordPress %s, ZIP %s\n' "$mode" "$wp_version" "$(basename "$plugin_zip")"
    "${wp_cli[@]}" core download --version="$wp_version" --locale=en_US --quiet
    printf '%s\n' "${GUYAMAP_TEST_DB_PASSWORD:-}" | "${wp_cli[@]}" config create \
        --dbname="$database" --dbuser="${GUYAMAP_TEST_DB_USER:-root}" \
        --dbhost="${GUYAMAP_TEST_DB_HOST:-localhost}" --dbprefix=guyamap_smoke_ \
        --skip-check --prompt=dbpass >/dev/null
    "${wp_cli[@]}" db create >/dev/null
    database_created=true
    for constant in WP_DEBUG WP_DEBUG_LOG; do "${wp_cli[@]}" config set "$constant" true --raw >/dev/null; done
    "${wp_cli[@]}" config set WP_DEBUG_DISPLAY false --raw >/dev/null
    "${wp_cli[@]}" core install --url=http://guyamap-smoke.test --title='Yandex Maps smoke' \
        --admin_user=guyamap_admin --admin_password=local-test-password \
        --admin_email=admin@example.invalid --skip-email >/dev/null
    : > "$site_dir/wp-content/debug.log"
    if [[ "$mode" == upgrade ]]; then
        "${wp_cli[@]}" plugin install "https://downloads.wordpress.org/plugin/yamap-block-gutenberg.$previous_version.zip" --activate >/dev/null
        "${wp_cli[@]}" post create --post_type=page --post_status=publish --post_title='Legacy map before upgrade' \
            '--post_content=<!-- wp:gutenberg-yandex-block/map {"lat":53.918777,"lon":27.562007,"has_placemark":true,"pm_lat":53.918777,"pm_lon":27.562007,"pm_balloon":"Legacy"} /-->' >/dev/null
        "${wp_cli[@]}" plugin install "$plugin_zip" --force --activate >/dev/null
    else
        "${wp_cli[@]}" plugin install "$plugin_zip" --activate >/dev/null
    fi
    [[ -z "$(problems)" ]] || { printf 'PHP problems on installation/activation:\n%s\n' "$(problems)" >&2; return 1; }
    runtime_checks "$version"
    uninstall_checks
    printf 'Package smoke passed (%s): %s on WordPress %s.\n' "$mode" "$(basename "$plugin_zip")" "$("${wp_cli[@]}" core version)"
    "${wp_cli[@]}" db drop --yes >/dev/null
    database_created=false
    rm -rf "$site_dir"
    site_dir=''
}

smoke_site clean
smoke_site upgrade
printf 'All package smoke scenarios passed for %s.\n' "$(basename "$plugin_zip")"
