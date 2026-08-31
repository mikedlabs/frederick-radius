#!/usr/bin/env bash

set -euo pipefail
umask 077

runner_uid=1001
runner_gid=1001
runner_root="${RUNNER_ROOT:-/runner}"

if [ "$(id -u)" = "0" ]; then
  if [ ! -x "$runner_root/run.sh" ]; then
    if find "$runner_root" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
      echo "Runner state is not empty but has no runner installation. Refusing to overwrite it." >&2
      exit 1
    fi
    cp -a /opt/actions-runner/. "$runner_root/"
  fi

  chown -R "$runner_uid:$runner_gid" "$runner_root"
  exec setpriv \
    --reuid="$runner_uid" \
    --regid="$runner_gid" \
    --init-groups \
    "$0" "$@"
fi

cd "$runner_root"

mkdir -p "${HOME:-$runner_root/home}" "${XDG_CACHE_HOME:-$runner_root/cache}" "${npm_config_cache:-$runner_root/cache/npm}"

runner_url="${RUNNER_URL:-https://github.com/mikedlabs/frederick-radius}"
runner_name="${RUNNER_NAME:-radius-data-nas}"
runner_labels="${RUNNER_LABELS:-radius-data}"
runner_workdir="${RUNNER_WORKDIR:-_work}"

if [ ! -f .runner ]; then
  if [ -z "${RUNNER_TOKEN:-}" ]; then
    echo "RUNNER_TOKEN is required only for the first registration." >&2
    exit 1
  fi

  ./config.sh \
    --unattended \
    --url "$runner_url" \
    --token "$RUNNER_TOKEN" \
    --name "$runner_name" \
    --labels "$runner_labels" \
    --work "$runner_workdir"
fi

# The one-hour registration token is never passed to the long-running listener.
unset RUNNER_TOKEN

exec ./run.sh
