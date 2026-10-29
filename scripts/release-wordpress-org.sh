#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly PLUGIN_SLUG="yamap-block-gutenberg"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
SOURCE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly SOURCE_ROOT
readonly PRODUCTION_ROOT="${SOURCE_ROOT}/production"
readonly PRODUCTION_TRUNK="${PRODUCTION_ROOT}/trunk"
readonly PRODUCTION_TAGS="${PRODUCTION_ROOT}/tags"
readonly MAIN_FILE="${SOURCE_ROOT}/yamap-block-gutenberg.php"
readonly README_FILE="${SOURCE_ROOT}/readme.txt"

RUN_ONLINE_README_VALIDATOR=true
WRITE_PRODUCTION=true
VERSION=""
TEMP_ROOT=""

usage() {
    cat <<'EOF'
Usage: scripts/release-wordpress-org.sh VERSION [--dry-run] [--skip-readme-validator]

Runs the complete release gate, builds one deterministic production ZIP, tests
that ZIP, and stages production/trunk/ plus production/tags/VERSION/ from it.
No SVN command, commit, tag, or network publication is performed.
EOF
}

log() { printf '[release] %s\n' "$*"; }
fail() { printf '[release] ERROR: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

cleanup() {
    if [[ -n "${TEMP_ROOT:-}" && "${TEMP_ROOT}" == "${TMPDIR:-/tmp}/${PLUGIN_SLUG}-release."* ]]; then
        rm -rf -- "${TEMP_ROOT}"
    fi
}
trap cleanup EXIT

while (( $# > 0 )); do
    case "$1" in
        --dry-run) WRITE_PRODUCTION=false ;;
        --skip-readme-validator) RUN_ONLINE_README_VALIDATOR=false ;;
        -h|--help) usage; exit 0 ;;
        -*) fail "Unknown option: $1" ;;
        *)
            [[ -z "${VERSION}" ]] || fail "Only one version argument is allowed."
            VERSION="$1"
            ;;
    esac
    shift
done

[[ -n "${VERSION}" ]] || { usage >&2; exit 2; }
[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "VERSION must use numeric x.y.z format."
for command_name in node npm php composer unzip curl find sort awk grep cmp rsync realpath base64 sha256sum; do
    require_command "${command_name}"
done
[[ -f "${MAIN_FILE}" && -f "${README_FILE}" ]] || fail "Plugin entry file or readme.txt is missing."

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/${PLUGIN_SLUG}-release.XXXXXXXX")"
readonly TEMP_ROOT
readonly EXTRACT_ROOT="${TEMP_ROOT}/extract"
readonly RELEASE_ROOT="${EXTRACT_ROOT}/${PLUGIN_SLUG}"
readonly ZIP_PATH="${SOURCE_ROOT}/dist/${PLUGIN_SLUG}-${VERSION}.zip"
readonly TAG_TARGET="${PRODUCTION_TAGS}/${VERSION}"
cd -- "${SOURCE_ROOT}"

validate_readme() {
    if [[ "${RUN_ONLINE_README_VALIDATOR}" == true ]]; then
        # The official validator groups findings under "### Fatal Errors:",
        # "### Errors:", "### Warnings:" and "### Notes:". Only findings that
        # are an accepted consequence of the mandated plugin display name are
        # tolerated; every other error or warning fails the release.
        bash scripts/check-readme.sh || fail "The official WordPress.org readme validator reported unexpected findings."
    fi
}

check_php_syntax() {
    while IFS= read -r -d '' php_file; do
        php -l "${php_file}" >/dev/null
    done < <(find includes tests/php -type f -name '*.php' -print0)
    php -l yamap-block-gutenberg.php >/dev/null
    php -l uninstall.php >/dev/null
}

assert_safe_target() {
    local target="$1"
    local expected="$2"
    [[ ! -L "${PRODUCTION_ROOT}" && ! -L "${target}" ]] || fail "Production output must not be a symbolic link."
    [[ "$(realpath -m "${target}")" == "$(realpath -m "${expected}")" ]] || fail "Unexpected output path: ${target}"
}

write_production_tree() {
    local target="$1"
    mkdir -p "${target}"
    rsync -a --delete "${RELEASE_ROOT}/" "${target}/"
    node scripts/audit-source.js "${target}"
    diff -qr "${RELEASE_ROOT}" "${target}" >/dev/null || fail "Staged tree differs from the verified ZIP: ${target}"
}

log "Installing the pinned dependencies"
npm ci
composer install --no-interaction --prefer-dist

log "Checking source quality"
composer validate --strict
composer lint
check_php_syntax
npm run lint:js
npm run lint:css
npm run test:unit
npm run icons:check
npm run icons:verify
npm run i18n:check
npm run check:versions -- "${VERSION}"
npm run audit:source
composer audit --locked
npm audit --omit=dev
validate_readme

log "Building and verifying the production artifact"
npm run build
npm run plugin-zip
npm run verify:package
unzip -tqq "${ZIP_PATH}"
mkdir -p "${EXTRACT_ROOT}"
unzip -q "${ZIP_PATH}" -d "${EXTRACT_ROOT}"
[[ -d "${RELEASE_ROOT}" ]] || fail "Archive does not contain the expected ${PLUGIN_SLUG}/ root."
node scripts/audit-source.js "${RELEASE_ROOT}"

log "Proving that an independent rebuild is byte-identical"
GUYAMAP_DIST_DIR="${TEMP_ROOT}/rebuild" SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}" node scripts/plugin-zip.js
cmp "${ZIP_PATH}" "${TEMP_ROOT}/rebuild/${PLUGIN_SLUG}-${VERSION}.zip" || fail "The production ZIP is not reproducible."

log "Testing the exact release ZIP in clean WordPress sites"
npm run test:package
npm run test:plugin-check
bash scripts/test-browser-e2e.sh

if [[ "${WRITE_PRODUCTION}" == true ]]; then
    assert_safe_target "${PRODUCTION_TRUNK}" "${SOURCE_ROOT}/production/trunk"
    assert_safe_target "${TAG_TARGET}" "${SOURCE_ROOT}/production/tags/${VERSION}"
    log "Writing production/trunk and production/tags/${VERSION} from the verified ZIP"
    write_production_tree "${PRODUCTION_TRUNK}"
    write_production_tree "${TAG_TARGET}"
    diff -qr "${PRODUCTION_TRUNK}" "${TAG_TARGET}" >/dev/null || fail "Production trunk and tag differ."
fi

sha256sum "${ZIP_PATH}"
log "Release ${VERSION} passed all configured gates. Verified ZIP: ${ZIP_PATH}"
if [[ "${WRITE_PRODUCTION}" == true ]]; then
    log "SVN staging is ready under ${PRODUCTION_ROOT}; nothing was committed or published."
else
    log "Dry run complete; production/ was not changed."
fi
