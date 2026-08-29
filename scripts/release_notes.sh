#!/bin/sh
# Extracts one version's section from CHANGELOG.md for use as GitHub release
# notes. Fails loudly rather than publishing empty notes when the tagged
# version has no changelog entry yet.
#
# Usage: scripts/release_notes.sh 0.1.0

set -e

version="$1"
if [ -z "$version" ]; then
  echo "usage: $0 <version, without a leading v>" >&2
  exit 1
fi

changelog="$(dirname "$0")/../CHANGELOG.md"

awk -v version="$version" '
  $0 ~ "^## \\[" version "\\]" { found=1; print; next }
  found && /^## \[/ { exit }
  found { print }
' "$changelog" > /tmp/release-notes.$$

if [ ! -s /tmp/release-notes.$$ ]; then
  echo "No CHANGELOG.md section found for version $version — add one before tagging." >&2
  rm -f /tmp/release-notes.$$
  exit 1
fi

cat /tmp/release-notes.$$
rm -f /tmp/release-notes.$$
