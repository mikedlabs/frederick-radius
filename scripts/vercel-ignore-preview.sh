#!/usr/bin/env bash
set -u

# Vercel Ignored Build Step helper.
# Exit 1 = build proceeds. Exit 0 = build is skipped.
# Production deploys always build. A preview builds only when the branch
# changes the rendered app (src/app, which holds globals.css, or
# src/components), so a reviewer can open a UI change in a browser. Data,
# docs, workflow and dependency branches still skip to limit Build CPU spend.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Production deployment: build proceeds."
  exit 1
fi

env_name=${VERCEL_ENV:-preview}

# The data-snapshots branch carries only data and this helper. Against main
# every app file would read as deleted, so a tree without the app never builds.
if [ ! -f package.json ] || [ ! -d src/app ]; then
  echo "$env_name deployment: no app tree in this branch, build skipped."
  exit 0
fi

UI_PATHS='^src/(app|components)/'

# Compare against the point where the branch left main, so every commit on
# the branch counts, including ones pushed before its pull request opened.
base=""
base_source=""
if fetch_error=$(timeout 30 git fetch --quiet --no-tags --depth=200 origin main 2>&1); then
  base=$(git merge-base FETCH_HEAD HEAD 2>/dev/null || true)
  # A shallow clone can miss the fork point; the main tip still bounds the diff.
  [ -n "$base" ] || base=$(git rev-parse --verify --quiet FETCH_HEAD || true)
  [ -z "$base" ] || base_source="main"
else
  echo "Could not fetch main: ${fetch_error%%$'\n'*}"
fi
if [ -z "$base" ] && [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] \
  && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  base=$VERCEL_GIT_PREVIOUS_SHA
  base_source="the last successful deployment"
fi
if [ -z "$base" ]; then
  base=$(git rev-parse --verify --quiet HEAD^ || true)
  base_source="the parent commit"
fi
if [ -z "$base" ]; then
  echo "$env_name deployment: no base commit to compare, build proceeds."
  exit 1
fi

if git diff --name-only "$base" HEAD -- | grep -Eq "$UI_PATHS"; then
  echo "$env_name deployment: the branch changes src/app or src/components since ${base:0:12} (${base_source}), build proceeds."
  exit 1
fi

echo "$env_name deployment: no UI changes since ${base:0:12} (${base_source}), build skipped to reduce Build CPU spend."
exit 0
