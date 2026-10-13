#!/usr/bin/env bash
set -euo pipefail

readonly uplink_gateway=172.31.254.1

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" = "0" ] || die "Proxy bootstrap must start as root."

# A dual-homed Docker container can otherwise select the internal bridge as its
# default route. Select the fixed uplink gateway explicitly, then remove every
# bootstrap capability before Squid parses requests.
ip -4 route replace default via "$uplink_gateway"
ip -4 route get 1.1.1.1 | grep -q "via $uplink_gateway" \
  || die "The proxy uplink route is unavailable."

exec setpriv \
  --reuid=13 \
  --regid=13 \
  --clear-groups \
  --bounding-set=-all \
  --inh-caps=-all \
  --ambient-caps=-all \
  --no-new-privs \
  -- /usr/sbin/squid --foreground -f /etc/squid/runner-egress.conf
