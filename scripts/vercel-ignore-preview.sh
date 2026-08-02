#!/usr/bin/env bash
set -u

# Vercel Ignored Build Step helper.
# Exit 1 = build proceeds. Exit 0 = build is skipped.
# Production deploys should always build; preview deploys are skipped to reduce Build CPU spend.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Production deployment: build proceeds."
  exit 1
fi

echo "${VERCEL_ENV:-preview} deployment: build skipped to reduce Build CPU spend."
exit 0
