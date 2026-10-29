#!/usr/bin/env bash
#
# Submits readme.txt to the official WordPress.org readme validator and fails
# on every finding that is not an accepted consequence of the mandated plugin
# display name.
#
# The acceptance rules live in scripts/readme-validator.js so that they can be
# unit tested and reused by the release entrypoint.

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly PROJECT_ROOT
readonly README_FILE="${PROJECT_ROOT}/readme.txt"
readonly VALIDATOR_URL='https://wordpress.org/plugins/developers/readme-validator/?output_format=md'

log() { printf '[readme] %s\n' "$*"; }
fail() { printf '[readme] ERROR: %s\n' "$*" >&2; exit 1; }

for command_name in curl base64 node; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
done
[[ -f "${README_FILE}" ]] || fail "readme.txt is missing."

REPORT_FILE="$(mktemp "${TMPDIR:-/tmp}/guyamap-readme-validator.XXXXXXXX.md")"
trap 'rm -f -- "${REPORT_FILE}"' EXIT

log "Submitting readme.txt to the official WordPress.org validator"
curl -fsS "${VALIDATOR_URL}" \
    --data-urlencode 'readme=' \
    --data-urlencode "readme_contents=$(base64 -w0 "${README_FILE}")" \
    -o "${REPORT_FILE}"

if ! node "${SCRIPT_DIR}/readme-validator.js" "${REPORT_FILE}"; then
    log "Validator report:"
    cat "${REPORT_FILE}" >&2
    fail "The official WordPress.org readme validator reported unexpected findings."
fi

log "WordPress.org readme validator accepted readme.txt"
