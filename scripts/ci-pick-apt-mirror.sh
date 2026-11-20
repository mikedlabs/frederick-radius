#!/usr/bin/env bash
# Put the fastest Ubuntu package mirror first in a hosted CI runner's mirror
# list, so the browser install does not crawl on a slow one.
#
# Why this exists: CI's browser install downloads about 126 MB of system
# packages. Hosted runners do not all list the same mirror first. Runners whose
# list starts with azure.archive.ubuntu.com fetch it in seconds. Runners whose
# list starts with us-east-2.ec2.archive.ubuntu.com fetched it at about
# 300 kB/s on 2026-11-19 and 2026-11-20 and hit the step's 10-minute limit on
# 8 of 27 attempts. archive.ubuntu.com also timed out for hours on 2026-11-11.
# A slow mirror is not an error, so apt never falls back on its own. CI
# therefore downloads the same 1 MiB of the signed package index from the
# runner's first mirror, the Azure mirror and archive.ubuntu.com, and lists the
# fastest first. Every other mirror stays listed as a fallback.
#
# This script only reads and prints. It keeps nothing it downloads, writes no
# file and needs no privileges; the workflow step does the one privileged
# write. Every mirror serves the same signed archive, and apt still verifies
# signatures whichever is listed first.
#
# Usage:
#   ci-pick-apt-mirror.sh < mirrors.txt
#       time the candidates and print the list, fastest first
#   ci-pick-apt-mirror.sh <mirror>=<bytes-per-second> ... < mirrors.txt
#       decide from given results instead of timing (used by tests)
# A result is a whole number of bytes per second, or anything else for "did
# not answer". A candidate moves to first place only when it is at least twice
# as fast as the runner's first mirror, or that mirror did not answer. Every
# unclear case prints the list unchanged.
set -euo pipefail

AZURE_MIRROR="http://azure.archive.ubuntu.com/ubuntu"
ARCHIVE_MIRROR="https://archive.ubuntu.com/ubuntu"

list="$(cat)"

# The runner's own first choice: the lowest priority number, or the first
# mirror line when none carries one. Comments are never mirrors.
current="$(printf '%s\n' "$list" | awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*https?:\/\// {
    url = $1; sub(/\/$/, "", url)
    p = 1000000 + NR
    if (match($0, /priority:[0-9]+/)) p = substr($0, RSTART + 9, RLENGTH - 9) + 0
    if (best == "" || p < bestp) { best = url; bestp = p }
  }
  END { print best }
')"

# A leading zero is rejected so bash arithmetic never reads a rate as octal.
is_rate() {
  [[ "$1" =~ ^(0|[1-9][0-9]*)$ ]]
}

probe() {
  local release rate
  release="$([ -r /etc/os-release ] && . /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")" || release=""
  if [ -n "$release" ] && rate="$(curl --fail --silent --output /dev/null --max-time 8 --range 0-1048575 --write-out '%{speed_download}' "$1/dists/${release}/main/binary-amd64/Packages.gz")"; then
    printf '%s' "${rate%%.*}"
  else
    printf 'failed'
  fi
}

# Parallel arrays, because macOS bash 3.2 has no associative arrays:
# candidates[i] has the result rates[i].
candidates=()
rates=()
add_candidate() {
  local url="${1%/}" known
  [ -n "$url" ] || return 0
  for known in ${candidates[@]+"${candidates[@]}"}; do
    [ "$known" = "$url" ] && return 0
  done
  candidates+=("$url")
  rates+=("${2:-}")
}

if [ "$#" -gt 0 ]; then
  for given in "$@"; do add_candidate "${given%%=*}" "${given#*=}"; done
else
  add_candidate "$current"
  add_candidate "$AZURE_MIRROR"
  add_candidate "$ARCHIVE_MIRROR"
  for i in "${!candidates[@]}"; do rates[i]="$(probe "${candidates[i]}")"; done
fi

summary=""
best=""
best_rate=0
current_rate=""
for i in ${candidates[@]+"${!candidates[@]}"}; do
  url="${candidates[i]}"
  rate="${rates[i]}"
  summary="${summary} ${url}=${rate:-failed}"
  if [ "$url" = "$current" ]; then current_rate="$rate"; fi
  if is_rate "$rate" && [ "$rate" -gt "$best_rate" ]; then
    best="$url"
    best_rate="$rate"
  fi
done
printf 'apt mirror check (bytes/s):%s\n' "$summary" >&2

if [ -z "$best" ] || [ "$best" = "$current" ] \
  || { is_rate "$current_rate" && [ "$best_rate" -lt $((current_rate * 2)) ]; }; then
  printf '%s\n' "$list"
  printf 'apt mirror order: kept %s first\n' "${current:-the runner list}" >&2
  exit 0
fi
printf 'apt mirror order: %s first\n' "$best" >&2

# The winner takes priority 1, added if the list lacks it. Every other mirror
# keeps its line and its relative order, renumbered from 2.
printf '%s\n' "$list" | awk -v best="$best" '
  function with_priority(line, value) {
    if (line ~ /priority:[0-9]+/) { sub(/priority:[0-9]+/, "priority:" value, line); return line }
    return line "\tpriority:" value
  }
  /^[[:space:]]*#/ { lines[NR] = $0; next }
  /^[[:space:]]*https?:\/\// {
    url = $1; sub(/\/$/, "", url)
    lines[NR] = $0
    if (url == best) { winner = NR; next }
    p = 1000000 + NR
    if (match($0, /priority:[0-9]+/)) p = substr($0, RSTART + 9, RLENGTH - 9) + 0
    order[++n] = NR; prio[NR] = p
    next
  }
  { lines[NR] = $0 }
  END {
    for (i = 2; i <= n; i++) {
      key = order[i]
      for (j = i - 1; 1 <= j && prio[key] < prio[order[j]]; j--) order[j + 1] = order[j]
      order[j + 1] = key
    }
    for (i = 1; i <= n; i++) rank[order[i]] = i + 1
    if (!winner) print best "/\tpriority:1"
    for (r = 1; r <= NR; r++) {
      if (r == winner) print with_priority(lines[r], 1)
      else if (r in rank) print with_priority(lines[r], rank[r])
      else print lines[r]
    }
  }
'
