#!/usr/bin/env bash

set -euo pipefail
umask 077

trap 'status=$?; printf "Runner bootstrap failed at line %s (exit %s).\n" "$LINENO" "$status" >&2' ERR

readonly runner_uid=1001
readonly runner_gid=1001
readonly runner_install="${RUNNER_INSTALL_ROOT:-/opt/actions-runner}"
readonly identity_dir="${RUNNER_IDENTITY_DIR:-/runner/identity}"
readonly scratch_dir="${RUNNER_SCRATCH_DIR:-/runner/scratch}"
readonly proxy_ip=172.31.255.2
readonly proxy_port=3128
export XTABLES_LOCKFILE=/tmp/xtables.lock

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_expected_paths() {
  [ "$runner_install" = "/opt/actions-runner" ] || die "Unexpected runner install path."
  [ "$identity_dir" = "/runner/identity" ] || die "Unexpected runner identity path."
  [ "$scratch_dir" = "/runner/scratch" ] || die "Unexpected runner scratch path."
  [ ! -L "$identity_dir" ] || die "Runner identity mount cannot be a symbolic link."
  [ ! -L "$scratch_dir" ] || die "Runner scratch mount cannot be a symbolic link."
  [ -x "$runner_install/bin/Runner.Listener" ] || die "The immutable runner listener is missing."
}

drop_to_runner() {
  setpriv \
    --reuid="$runner_uid" \
    --regid="$runner_gid" \
    --init-groups \
    --bounding-set=-all \
    --inh-caps=-all \
    --ambient-caps=-all \
    --no-new-privs \
    -- "$@"
}

reset_scratch() {
  echo "Resetting disposable runner work and caches."
  mkdir -p "$scratch_dir"
  find "$scratch_dir" -xdev -depth -mindepth 1 -delete
  chmod 0711 "$scratch_dir"
  install -d -m 0700 -o "$runner_uid" -g "$runner_gid" \
    "$scratch_dir/home" \
    "$scratch_dir/cache" \
    "$scratch_dir/cache/npm" \
    "$scratch_dir/tool-cache" \
    "$scratch_dir/action-cache" \
    "$scratch_dir/diag" \
    "$scratch_dir/work"
}

restrict_egress_to_proxy() {
  echo "Restricting runner egress to the approved proxy."
  iptables -w 5 -P OUTPUT DROP
  iptables -w 5 -F OUTPUT
  # The listener addresses the proxy by fixed IP and never needs Docker's
  # embedded resolver. Deny it before the loopback allow rule so an old engine
  # cannot turn internal-network DNS into an exfiltration path.
  iptables -w 5 -A OUTPUT -d 127.0.0.11 -j DROP
  iptables -w 5 -A OUTPUT -o lo -j ACCEPT
  iptables -w 5 -A OUTPUT \
    -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -w 5 -A OUTPUT \
    -p tcp -d "$proxy_ip" --dport "$proxy_port" -j ACCEPT
}

identity_is_complete() {
  [ -f "$identity_dir/.registration-complete" ] \
    && [ -s "$identity_dir/.runner" ] \
    && [ -s "$identity_dir/.credentials" ] \
    && [ -s "$identity_dir/.credentials_rsaparams" ]
}

register_runner() {
  if identity_is_complete; then
    echo "The hardened runner identity is already registered."
    if [ -n "${RUNNER_TOKEN:-}" ]; then
      echo "RUNNER_TOKEN is no longer needed; blank it and recreate the project."
    fi
    return
  fi

  [ -n "${RUNNER_TOKEN:-}" ] || die "RUNNER_TOKEN is required for fresh registration."
  if find "$identity_dir" -xdev -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    die "Runner identity is incomplete but not empty; refusing an in-place repair."
  fi

  chown "$runner_uid:$runner_gid" "$identity_dir"
  chmod 0700 "$identity_dir"

  # Registration runs in a disposable image target with a writable container
  # overlay. Remove only partial upstream config left by a failed prior start;
  # the verified executable tree is never copied from this overlay.
  for config_file in .runner .credentials .credentials_rsaparams svc.sh; do
    [ ! -L "$runner_install/$config_file" ] \
      || die "The registration image contains an unexpected config symlink."
    rm -f "$runner_install/$config_file"
  done

  local runner_url="${RUNNER_URL:-https://github.com/mikedlabs/frederick-radius}"
  local runner_name="${RUNNER_NAME:-radius-data-nas-v2}"
  local runner_labels="${RUNNER_LABELS:-radius-data}"
  local runner_workdir="${RUNNER_WORKDIR:-_work}"

  [ "$runner_labels" = "radius-data" ] || die "Unexpected runner label set."

  echo "Registering a no-default-label, update-disabled NAS runner."
  drop_to_runner "$runner_install/bin/Runner.Listener" configure \
    --unattended \
    --url "$runner_url" \
    --token "$RUNNER_TOKEN" \
    --name "$runner_name" \
    --labels "$runner_labels" \
    --no-default-labels \
    --disableupdate \
    --work "$runner_workdir"

  for required_file in .runner .credentials .credentials_rsaparams; do
    [ -s "$runner_install/$required_file" ] \
      || die "Registration returned without a complete local identity."
    [ ! -L "$runner_install/$required_file" ] \
      || die "Registration created an unexpected identity symlink."
    install -m 0600 -o "$runner_uid" -g "$runner_gid" \
      "$runner_install/$required_file" "$identity_dir/$required_file"
  done

  install -m 0444 -o root -g root /dev/null "$identity_dir/.registration-complete"
  chown root:actions "$identity_dir"
  chmod 0750 "$identity_dir"
  rm -f \
    "$runner_install/.runner" \
    "$runner_install/.credentials" \
    "$runner_install/.credentials_rsaparams" \
    "$runner_install/svc.sh"
  echo "Registration completed. The listener will mount this identity read-only."
}

listen_once() {
  identity_is_complete || die "No complete hardened runner identity is available."
  [ -z "${RUNNER_TOKEN:-}" ] || die "The long-running listener must not receive RUNNER_TOKEN."
  [ "$(readlink "$runner_install/.runner")" = "/runner/identity/.runner" ] \
    || die "Runner settings are not linked to the read-only identity mount."
  [ "$(readlink "$runner_install/.credentials")" = "/runner/identity/.credentials" ] \
    || die "Runner credentials are not linked to the read-only identity mount."
  [ "$(readlink "$runner_install/.credentials_rsaparams")" = "/runner/identity/.credentials_rsaparams" ] \
    || die "Runner RSA credentials are not linked to the read-only identity mount."
  [ "$(readlink "$runner_install/_diag")" = "/runner/scratch/diag" ] \
    || die "Runner diagnostics are not linked to disposable scratch."
  [ "$(readlink "$runner_install/_work")" = "/runner/scratch/work" ] \
    || die "Runner work is not linked to disposable scratch."

  echo "Starting one isolated job listener cycle."
  exec setpriv \
    --reuid="$runner_uid" \
    --regid="$runner_gid" \
    --init-groups \
    --bounding-set=-all \
    --inh-caps=-all \
    --ambient-caps=-all \
    --no-new-privs \
    -- "$runner_install/bin/Runner.Listener" run --once
}

[ "$(id -u)" = "0" ] || die "Runner bootstrap must start as root."
require_expected_paths
reset_scratch
restrict_egress_to_proxy

case "${1:-listen}" in
  register)
    register_runner
    ;;
  listen)
    listen_once
    ;;
  *)
    die "Unknown runner mode."
    ;;
esac
