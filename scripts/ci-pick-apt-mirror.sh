#!/usr/bin/env bash
# Decide which Ubuntu package mirror a hosted CI runner should try first, and
# reorder the runner's mirror list to match.
#
# Why this exists: CI's browser install downloads about 180 system packages.
# Either mirror can stall from a hosted runner. The runner's Azure mirror has
# stalled in the past, and archive.ubuntu.com timed out for hours on
# 2026-11-11 and blocked every merge. So CI times one small signed index file
# on each mirror and lists the faster one first. The other stays as a fallback.
#
# This script only reads and prints. It keeps nothing it downloads, writes no
# file and needs no privileges; the workflow step does the one privileged
# write. Both mirrors serve the same signed archive, and apt still verifies
# signatures whichever is listed first.
#
# Usage:
#   ci-pick-apt-mirror.sh                    time both mirrors; print "archive" or "azure"
#   ci-pick-apt-mirror.sh <azure> <archive>  decide from given results (used by tests)
#   ci-pick-apt-mirror.sh --archive-first    read a mirror list on stdin, print it
#                                            with archive.ubuntu.com first
# A result is a number of seconds, or anything else for "did not answer".
# Every unclear case prints "azure", which leaves the runner's own order alone.
set -euo pipefail

AZURE_MIRROR="http://azure.archive.ubuntu.com/ubuntu"
ARCHIVE_MIRROR="https://archive.ubuntu.com/ubuntu"

if [ "${1:-}" = "--archive-first" ]; then
  # Comments and other mirrors pass through untouched. The Azure line drops to
  # second place and the archive line takes first, added if the list lacks it.
  awk -v fallback="${ARCHIVE_MIRROR}/" '
    function with_priority(line, value) {
      if (line ~ /priority:[0-9]+/) { sub(/priority:[0-9]+/, "priority:" value, line); return line }
      return line "\tpriority:" value
    }
    /^[[:space:]]*https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/?([[:space:]]|$)/ { print with_priority($0, 2); next }
    /^[[:space:]]*https?:\/\/archive\.ubuntu\.com\/ubuntu\/?([[:space:]]|$)/ { print with_priority($0, 1); found = 1; next }
    { print }
    END { if (!found) print fallback "\tpriority:1" }
  '
  exit 0
fi

probe() {
  local release seconds
  release="$([ -r /etc/os-release ] && . /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")" || release=""
  if [ -n "$release" ] && seconds="$(curl --fail --silent --output /dev/null --max-time 8 --write-out '%{time_total}' "$1/dists/${release}/InRelease")"; then
    printf '%s' "$seconds"
  else
    printf 'failed'
  fi
}

is_seconds() {
  [[ "$1" =~ ^[0-9]+(\.[0-9]+)?$ ]]
}

if [ "$#" -eq 2 ]; then
  azure="$1"
  archive="$2"
else
  azure="$(probe "$AZURE_MIRROR")"
  archive="$(probe "$ARCHIVE_MIRROR")"
fi
printf 'apt mirror check: azure=%s archive=%s\n' "$azure" "$archive" >&2

if ! is_seconds "$archive"; then
  echo azure
elif ! is_seconds "$azure"; then
  echo archive
elif awk -v archive="$archive" -v azure="$azure" 'BEGIN { exit !(archive + 0 < azure + 0) }'; then
  echo archive
else
  echo azure
fi
