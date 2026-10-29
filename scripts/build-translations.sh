#!/usr/bin/env bash
set -euo pipefail

base_dir=$(cd "$(dirname "$0")/.." && pwd)
domain=yamap-block-gutenberg
languages="$base_dir/languages"
pot="$languages/$domain.pot"
command -v wp >/dev/null 2>&1 || { printf 'WP-CLI (wp) is required to build translations.\n' >&2; exit 1; }

fresh=$(mktemp)
trap 'rm -f "$fresh"' EXIT
(
    cd "$base_dir"
    wp i18n make-pot . "$fresh" --slug="$domain" --domain="$domain" \
        --exclude=vendor,node_modules,tests,dist,production,output,assets,languages,scripts,docs,.release-baseline --quiet
)
if [[ -f "$pot" ]] && diff -q <(grep -v '^"POT-Creation-Date: ' "$pot") <(grep -v '^"POT-Creation-Date: ' "$fresh") >/dev/null; then
    printf 'Template is current: %s\n' "${pot#"$base_dir"/}"
else
    cp "$fresh" "$pot"
    printf 'Template updated: %s\n' "${pot#"$base_dir"/}"
fi

if compgen -G "$languages/$domain-*.po" >/dev/null; then
    wp i18n update-po "$pot" "$languages"
    wp i18n make-mo "$languages"
    wp i18n make-json "$languages" --no-purge --use-map="$base_dir/scripts/i18n-map.json"
fi
bash "$base_dir/scripts/check-translations.sh"
