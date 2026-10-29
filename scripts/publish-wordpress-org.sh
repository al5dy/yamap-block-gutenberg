#!/usr/bin/env bash
#
# Publishes a verified production artifact to the WordPress.org Subversion
# repository in a single commit.
#
# The input is the staging tree produced by scripts/release-wordpress-org.sh:
#
#   production/trunk/          the runtime files of the release
#   production/tags/VERSION/   an identical copy for the version tag
#
# The script never rebuilds anything. It publishes exactly the files that were
# verified and tested, and it refuses to run when the staging tree, the release
# ZIP and the working copy disagree.
#
# Usage: scripts/publish-wordpress-org.sh VERSION [--svn-path PATH] [--zip PATH] [--dry-run]

set -Eeuo pipefail
IFS=$'\n\t'

readonly PLUGIN_SLUG="yamap-block-gutenberg"
readonly EXPECTED_REPOSITORY="https://plugins.svn.wordpress.org"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
SOURCE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly SOURCE_ROOT
readonly PRODUCTION_ROOT="${SOURCE_ROOT}/production"
readonly PRODUCTION_TRUNK="${PRODUCTION_ROOT}/trunk"
readonly PRODUCTION_TAGS="${PRODUCTION_ROOT}/tags"

VERSION=""
SVN_PATH="${SVN_WORDPESS_ORG_PATH:-}"
RELEASE_ZIP=""
DRY_RUN=false

usage() {
    cat <<'EOF'
Usage: scripts/publish-wordpress-org.sh VERSION [--svn-path PATH] [--zip PATH] [--dry-run]

Publishes the release to the WordPress.org Subversion repository.

The published files are taken from the release ZIP, which is the single
verified artifact. The ZIP is compared with the staged tree produced by
scripts/release-wordpress-org.sh VERSION, and both must agree before
anything is committed. Point --zip at the ZIP attached to the GitHub
Release to publish exactly the artifact that was published there.
EOF
}

log() { printf '[publish] %s\n' "$*"; }
fail() { printf '[publish] ERROR: %s\n' "$*" >&2; exit 1; }

while (( $# > 0 )); do
    case "$1" in
        --svn-path) [[ $# -ge 2 ]] || fail "--svn-path needs a value."; SVN_PATH="$2"; shift ;;
        --zip) [[ $# -ge 2 ]] || fail "--zip needs a value."; RELEASE_ZIP="$2"; shift ;;
        --dry-run) DRY_RUN=true ;;
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
for command_name in svn node rsync diff find unzip; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
done

readonly STAGED_TRUNK="${PRODUCTION_TRUNK}"
readonly STAGED_TAG="${PRODUCTION_TAGS}/${VERSION}"
[[ -n "${RELEASE_ZIP}" ]] || RELEASE_ZIP="${SOURCE_ROOT}/dist/${PLUGIN_SLUG}-${VERSION}.zip"

[[ -d "${STAGED_TRUNK}" ]] || fail "Staged trunk is missing. Run scripts/release-wordpress-org.sh ${VERSION} first."
[[ -d "${STAGED_TAG}" ]] || fail "Staged tag ${VERSION} is missing. Run scripts/release-wordpress-org.sh ${VERSION} first."
[[ -f "${RELEASE_ZIP}" ]] || fail "Release ZIP ${RELEASE_ZIP} is missing."
diff -qr "${STAGED_TRUNK}" "${STAGED_TAG}" >/dev/null || fail "Staged trunk and staged tag differ."

if [[ -z "${SVN_PATH}" ]]; then
    printf '[publish] ERROR: pass --svn-path with the WordPress.org working copy, or set SVN_WORDPESS_ORG_PATH.\n' >&2
    exit 2
fi
[[ -d "${SVN_PATH}" ]] || fail "The Subversion working copy ${SVN_PATH} does not exist."
[[ -d "${SVN_PATH}/.svn" ]] || fail "${SVN_PATH} is not a Subversion working copy."

cd -- "${SVN_PATH}"
WC_URL="$(svn info --show-item url . 2>/dev/null || true)"
readonly WC_URL
[[ "${WC_URL}" == "${EXPECTED_REPOSITORY}/${PLUGIN_SLUG}" ]] ||
    fail "Unexpected working copy URL '${WC_URL}'. Expected ${EXPECTED_REPOSITORY}/${PLUGIN_SLUG}."
log "Working copy ${WC_URL} at revision $(svn info --show-item revision .)"

readonly TRUNK_DIR="${SVN_PATH}/trunk"
readonly TAGS_DIR="${SVN_PATH}/tags"
[[ -d "${TRUNK_DIR}" ]] || fail "trunk is missing in the working copy."
[[ -d "${TAGS_DIR}" ]] || fail "tags is missing in the working copy."

# The release must not be published twice.
if svn info "${TAGS_DIR}/${VERSION}" >/dev/null 2>&1; then
    fail "The tag ${VERSION} already exists. Inspect it before publishing again."
fi

# Refuse to publish over unrelated local changes. The status is read from the
# working copy root so that every path is relative to it.
UNRELATED="$(svn status . | grep -v -E '^[?]' || true)"
if [[ -n "${UNRELATED}" ]]; then
    printf '%s\n' "${UNRELATED}" >&2
    fail "The working copy has local changes that this release does not own."
fi
PRE_UNVERSIONED="$(svn status . | grep -E '^[?]' | sed 's/^?[[:space:]]*//' || true)"

# The release ZIP is the single source of the published files. It is compared
# with the staged tree, so the tested artifact and the published files are the
# same bytes.
EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/guyamap-publish.XXXXXXXX")"
readonly EXTRACT_DIR
readonly ZIP_ROOT="${EXTRACT_DIR}/${PLUGIN_SLUG}"
unzip -q "${RELEASE_ZIP}" -d "${EXTRACT_DIR}"
[[ -d "${ZIP_ROOT}" ]] || fail "The release ZIP has no ${PLUGIN_SLUG}/ root directory."
node "${SCRIPT_DIR}/verify-staged-tree.js" "${RELEASE_ZIP}" "${STAGED_TRUNK}" ||
    fail "The staged tree does not match the release ZIP."
log "Publishing the contents of ${RELEASE_ZIP}"

# Remember the current trunk so that obsolete files can be removed with SVN.
OLD_ENTRIES="$(mktemp "${TMPDIR:-/tmp}/guyamap-trunk-entries.XXXXXXXX")"
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/guyamap-trunk-backup.XXXXXXXX")"
cleanup() {
    rm -f -- "${OLD_ENTRIES}"
    [[ -d "${BACKUP_DIR}" ]] && rm -rf -- "${BACKUP_DIR}"
    [[ -d "${EXTRACT_DIR}" ]] && rm -rf -- "${EXTRACT_DIR}"
    return 0
}
trap cleanup EXIT

svn ls -R "${TRUNK_DIR}" > "${OLD_ENTRIES}"

# Back up the current trunk before it is changed.
rsync -a --exclude '.svn' "${TRUNK_DIR}/" "${BACKUP_DIR}/"
log "Backed up the current trunk to ${BACKUP_DIR}"

# Copy the new content into the trunk from the release ZIP. Files that no
# longer exist in the release are removed with SVN-aware commands afterwards.
rsync -a --exclude '.svn' "${ZIP_ROOT}/" "${TRUNK_DIR}/"

NEW_FILES="$(cd "${ZIP_ROOT}" && find . -type f | sed 's|^\./||' | sort)"
NEW_DIRS="$(cd "${ZIP_ROOT}" && find . -type d | sed 's|^\./||' | sed 's|/$||' | grep -v '^$' | sort)"

removed=0
added=0
while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    relative="${entry%/}"
    if ! printf '%s\n' "${NEW_FILES}" | grep -qx -- "${relative}" &&
        ! printf '%s\n' "${NEW_DIRS}" | grep -qx -- "${relative}"; then
        log "Removing obsolete trunk entry: ${relative}"
        svn rm --quiet --force "${TRUNK_DIR}/${relative}"
        removed=$((removed + 1))
    fi
done < "${OLD_ENTRIES}"

while IFS= read -r relative; do
    [[ -n "${relative}" ]] || continue
    if ! svn status "${TRUNK_DIR}/${relative}" 2>/dev/null | grep -q .; then
        continue
    fi
    if svn status "${TRUNK_DIR}/${relative}" | grep -q '^?'; then
        svn add --quiet --parents --force "${TRUNK_DIR}/${relative}"
        added=$((added + 1))
    fi
done <<< "${NEW_FILES}"

# The tag is a Subversion copy of the trunk, which keeps the copy history.
log "Creating the version tag tags/${VERSION} as a copy of trunk"
svn copy --quiet "${TRUNK_DIR}" "${TAGS_DIR}/${VERSION}"

# The tag and the trunk must be identical before the commit.
diff -qr --exclude '.svn' "${TRUNK_DIR}" "${TAGS_DIR}/${VERSION}" >/dev/null ||
    fail "trunk and tags/${VERSION} differ."

STATUS="$(svn status "${SVN_PATH}")"
printf '%s\n' "${STATUS}"
log "Summary: ${removed} removed, ${added} added"

if [[ "${DRY_RUN}" == true ]]; then
    log "Dry run: nothing was committed. Restoring the working copy."
    svn revert --recursive --quiet "${SVN_PATH}"
    while IFS= read -r leftover; do
        [[ -n "${leftover}" ]] || continue
        if ! printf '%s\n' "${PRE_UNVERSIONED}" | grep -qx -- "${leftover}"; then
            rm -rf -- "${SVN_PATH:?}/${leftover}" || true
        fi
    done < <(svn status . | grep -E '^[?]' | sed 's/^?[[:space:]]*//' || true)
    log "Dry run complete; the working copy was restored."
    exit 0
fi

log "Committing the release"
svn commit "${SVN_PATH}" -m "Release ${VERSION} of Yandex Maps for Gutenberg.

Renamed the plugin to Yandex Maps for Gutenberg, rewrote the developer and
WordPress.org documentation, and standardized the source audits, quality
checks, deterministic packaging and GitHub release infrastructure.

The block identifier, the plugin slug, the text domain and every stored
attribute are unchanged, so existing content keeps working."

log "Verifying the remote repository"
svn update --quiet "${SVN_PATH}"
REMOTE_TAG="$(svn info --show-item last-changed-revision "${TAGS_DIR}/${VERSION}")"
log "Published tags/${VERSION} in revision ${REMOTE_TAG}"
log "Release ${VERSION} published to ${WC_URL}"
