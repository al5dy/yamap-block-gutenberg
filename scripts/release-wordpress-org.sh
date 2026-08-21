#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly PLUGIN_SLUG="yamap-block-gutenberg"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SOURCE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly PRODUCTION_ROOT="${SOURCE_ROOT}/production"
readonly PRODUCTION_TRUNK="${PRODUCTION_ROOT}/trunk"
readonly PRODUCTION_TAGS="${PRODUCTION_ROOT}/tags"
readonly WP_ROOT="${GUYAMAP_WP_ROOT:-/opt/lampp/htdocs/lokotkov.dev}"
readonly ZIP_PATH="${SOURCE_ROOT}/${PLUGIN_SLUG}.zip"
readonly MAIN_FILE="${SOURCE_ROOT}/yamap-block-gutenberg.php"
readonly README_FILE="${SOURCE_ROOT}/readme.txt"

RUN_E2E=true
RUN_ONLINE_README_VALIDATOR=true
WRITE_PRODUCTION=true
VERSION=""
TEMP_ROOT=""

usage() {
	cat <<'EOF'
Usage:
  scripts/release-wordpress-org.sh VERSION [options]

The default mode builds, validates and creates:
  production/trunk/
  production/tags/VERSION/

Both directories contain the same clean, production-only plugin files. The
script does not access SVN and never commits or publishes anything.

Options:
  --dry-run                 Build and validate without writing production/.
  --skip-e2e                Skip the Playwright/Gutenberg smoke test.
  --skip-readme-validator   Skip the online WordPress.org readme validator.
  -h, --help                Show this help.

Environment:
  GUYAMAP_WP_ROOT           Local WordPress root used by browser tests.

Example:
  scripts/release-wordpress-org.sh 2.0.0
EOF
}

log() {
	printf '[release] %s\n' "$*"
}

fail() {
	printf '[release] ERROR: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

cleanup() {
	if [[ -n "${TEMP_ROOT:-}" && "${TEMP_ROOT}" == "${TMPDIR:-/tmp}/${PLUGIN_SLUG}-release."* ]]; then
		rm -rf -- "${TEMP_ROOT}"
	fi
}
trap cleanup EXIT

while (( $# > 0 )); do
	case "$1" in
		--dry-run)
			WRITE_PRODUCTION=false
			;;
		--skip-e2e)
			RUN_E2E=false
			;;
		--skip-readme-validator)
			RUN_ONLINE_README_VALIDATOR=false
			;;
		-h|--help)
			usage
			exit 0
			;;
		-*)
			fail "Unknown option: $1"
			;;
		*)
			[[ -z "${VERSION}" ]] || fail "Only one version argument is allowed."
			VERSION="$1"
			;;
	esac
	shift
done

[[ -n "${VERSION}" ]] || {
	usage >&2
	exit 2
}
[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
	fail "VERSION must use the numeric x.y.z format."

for command_name in node npm php composer unzip curl find sort awk grep cmp rsync realpath base64; do
	require_command "${command_name}"
done

[[ -f "${MAIN_FILE}" && -f "${README_FILE}" ]] ||
	fail "Plugin entry file or readme.txt is missing."

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/${PLUGIN_SLUG}-release.XXXXXXXX")"
readonly TEMP_ROOT
readonly EXTRACT_ROOT="${TEMP_ROOT}/extract"
readonly RELEASE_ROOT="${EXTRACT_ROOT}/${PLUGIN_SLUG}"
readonly RELEASE_MANIFEST="${TEMP_ROOT}/release-files.txt"
readonly TAG_TARGET="${PRODUCTION_TAGS}/${VERSION}"

cd -- "${SOURCE_ROOT}"

assert_version() {
	local label="$1"
	local actual="$2"
	[[ "${actual}" == "${VERSION}" ]] ||
		fail "${label} version is '${actual:-missing}', expected '${VERSION}'."
}

read_json_version() {
	node -e 'const fs=require("fs"); const p=process.argv[1]; process.stdout.write(String(JSON.parse(fs.readFileSync(p,"utf8")).version || ""));' "$1"
}

read_php_header_version() {
	php -r '$s=file_get_contents($argv[1]); if (!preg_match("/^[ \\t*#@\\/]*Version:\\s*(.+)$/mi", $s, $m)) { exit(2); } echo trim($m[1]);' "$1"
}

read_php_constant_version() {
	php -r '$s=file_get_contents($argv[1]); if (!preg_match("/define\\(\\s*[\x27\x22]GUYAMAP_VERSION[\x27\x22]\\s*,\\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]/", $s, $m)) { exit(2); } echo $m[1];' "$1"
}

read_stable_tag() {
	awk -F ':' 'tolower($1) ~ /^stable tag$/ { sub(/^[[:space:]]+/, "", $2); sub(/[[:space:]]+$/, "", $2); print $2; exit }' "$1"
}

validate_versions() {
	log "Checking version ${VERSION} across PHP, readme and block metadata"
	assert_version "Plugin header" "$(read_php_header_version "${MAIN_FILE}")"
	assert_version "GUYAMAP_VERSION" "$(read_php_constant_version "${MAIN_FILE}")"
	assert_version "package.json" "$(read_json_version "${SOURCE_ROOT}/package.json")"
	assert_version "src/block.json" "$(read_json_version "${SOURCE_ROOT}/src/block.json")"
	assert_version "build/block.json" "$(read_json_version "${SOURCE_ROOT}/build/block.json")"
	assert_version "readme Stable tag" "$(read_stable_tag "${README_FILE}")"
}

validate_readme() {
	local byte_count
	local tag_count
	local validator_output

	byte_count="$(wc -c < "${README_FILE}")"
	(( byte_count <= 10000 )) ||
		fail "readme.txt is ${byte_count} bytes; keep it at or below 10,000 bytes."

	tag_count="$(awk -F ':' 'tolower($1) ~ /^tags$/ { n=split($2,t,","); print n; exit }' "${README_FILE}")"
	(( tag_count >= 1 && tag_count <= 5 )) ||
		fail "readme.txt must contain between one and five tags."

	if [[ "${RUN_ONLINE_README_VALIDATOR}" == true ]]; then
		log "Submitting readme.txt to the official WordPress.org validator"
		validator_output="${TEMP_ROOT}/readme-validator.md"
		curl -fsS 'https://wordpress.org/plugins/developers/readme-validator/?output_format=md' \
			--data-urlencode 'readme=' \
			--data-urlencode "readme_contents=$(base64 -w0 "${README_FILE}")" \
			-o "${validator_output}"
		if grep -q '^### Errors:' "${validator_output}"; then
			sed -n '/^### Errors:/,/^### /p' "${validator_output}" >&2
			fail "The official WordPress.org readme validator reported errors."
		fi
		log "WordPress.org readme validator: no errors"
	fi
}

check_php_syntax() {
	log "Checking PHP syntax"
	while IFS= read -r -d '' php_file; do
		php -l "${php_file}" >/dev/null
	done < <(find "${SOURCE_ROOT}" \
		-path "${SOURCE_ROOT}/vendor" -prune -o \
		-path "${SOURCE_ROOT}/node_modules" -prune -o \
		-path "${PRODUCTION_ROOT}" -prune -o \
		-type f -name '*.php' -print0)
}

run_quality_checks() {
	log "Running JavaScript, CSS and PHP quality checks"
	npm run lint:js
	npm run lint:css
	npm run test:unit
	composer lint
	check_php_syntax

	if [[ "${RUN_E2E}" == true ]]; then
		[[ -d "${WP_ROOT}/wp-admin" ]] ||
			fail "WordPress root for E2E was not found: ${WP_ROOT}"
		GUYAMAP_E2E_WP_PATH="${WP_ROOT}" npm run test:e2e
	else
		log "Skipping Playwright/Gutenberg smoke test by request"
	fi
}

validate_release_tree() {
	local tree_root="$1"
	local tree_label="$2"

	if find "${tree_root}" -type l -print -quit | grep -q .; then
		fail "${tree_label} contains a symbolic link."
	fi
	if find "${tree_root}" \
		\( -name '.git' -o -name '.svn' -o -name '.idea' -o -name 'node_modules' \
		-o -name 'vendor' -o -name 'tests' -o -name 'test-results' \
		-o -name 'playwright-report' -o -name 'AGENTS.md' \
		-o -name 'composer.json' -o -name 'composer.lock' \
		-o -name 'package.json' -o -name 'package-lock.json' \
		-o -name 'src' -o -name 'docs' -o -name 'scripts' \
		-o -name '.distignore' -o -name '.gitignore' \
		-o -name 'playwright.config.js' -o -name 'phpcs.xml.dist' \
		-o -name '*.zip' \) -print -quit | grep -q .; then
		fail "${tree_label} contains a forbidden development path."
	fi
}

build_release() {
	log "Building production assets"
	npm run build
	validate_versions
	validate_readme
	run_quality_checks

	log "Creating clean plugin archive"
	npm run plugin-zip
	unzip -tqq "${ZIP_PATH}"
	mkdir -p "${EXTRACT_ROOT}"
	unzip -q "${ZIP_PATH}" -d "${EXTRACT_ROOT}"
	[[ -d "${RELEASE_ROOT}" ]] ||
		fail "Archive does not contain the expected ${PLUGIN_SLUG}/ root."
	validate_release_tree "${RELEASE_ROOT}" "Release archive"

	(
		cd -- "${RELEASE_ROOT}"
		find . -type f -print | sed 's#^\./##' | LC_ALL=C sort
	) > "${RELEASE_MANIFEST}"

	local release_count
	release_count="$(wc -l < "${RELEASE_MANIFEST}")"
	(( release_count > 0 )) || fail "Release archive is empty."
	log "Release archive verified: ${release_count} files, $(du -h "${ZIP_PATH}" | awk '{print $1}')"
}

assert_safe_target() {
	local target="$1"
	local expected="$2"

	[[ ! -L "${PRODUCTION_ROOT}" && ! -L "${target}" ]] ||
		fail "Production output directories must not be symbolic links."
	[[ "$(realpath -m "${target}")" == "$(realpath -m "${expected}")" ]] ||
		fail "Refusing to synchronize an unexpected output path: ${target}"
}

write_production_tree() {
	local target="$1"
	local label="$2"
	local target_manifest="${TEMP_ROOT}/${label}-files.txt"

	mkdir -p "${target}"
	rsync -a --delete "${RELEASE_ROOT}/" "${target}/"
	validate_release_tree "${target}" "${label}"
	(
		cd -- "${target}"
		find . -type f -print | sed 's#^\./##' | LC_ALL=C sort
	) > "${target_manifest}"
	cmp -s "${RELEASE_MANIFEST}" "${target_manifest}" ||
		fail "${label} does not exactly match the verified release archive."
}

create_production_directories() {
	assert_safe_target "${PRODUCTION_TRUNK}" "${SOURCE_ROOT}/production/trunk"
	assert_safe_target "${TAG_TARGET}" "${SOURCE_ROOT}/production/tags/${VERSION}"

	log "Writing production/trunk"
	write_production_tree "${PRODUCTION_TRUNK}" "production-trunk"
	log "Writing production/tags/${VERSION}"
	write_production_tree "${TAG_TARGET}" "production-tag-${VERSION}"

	diff -qr "${PRODUCTION_TRUNK}" "${TAG_TARGET}" >/dev/null ||
		fail "Production trunk and tag are not identical."
}

print_summary() {
	cat <<EOF

Production release ${VERSION} is ready.

Clean WordPress.org trees:
  ${PRODUCTION_TRUNK}
  ${TAG_TARGET}

Optional ZIP artifact:
  ${ZIP_PATH}

Copy the contents of production/trunk into your SVN trunk and the contents of
production/tags/${VERSION} into the corresponding SVN tag when you are ready.
No SVN command was executed by this script.
EOF
}

build_release

if [[ "${WRITE_PRODUCTION}" == true ]]; then
	create_production_directories
	print_summary
else
	log "Dry run complete; production/ was not changed."
fi
