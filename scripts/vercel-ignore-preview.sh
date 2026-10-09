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
# Vercel's clone has no origin remote and only shallow history, so fetch
# main and this branch from the repository URL Vercel names (it is public).
remote=""
if git remote get-url origin >/dev/null 2>&1; then
  remote=origin
elif [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
  remote="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git"
fi
refspecs=("+refs/heads/main:refs/preview-base/main")
if [ -n "${VERCEL_GIT_COMMIT_REF:-}" ]; then
  refspecs+=("+refs/heads/${VERCEL_GIT_COMMIT_REF}:refs/preview-base/head")
fi
base=""
base_source=""
if [ -z "$remote" ]; then
  echo "Could not fetch main: no origin remote and no repository named by Vercel."
elif fetch_error=$(timeout 45 git fetch --quiet --no-tags --depth=200 "$remote" "${refspecs[@]}" 2>&1); then
  base=$(git merge-base refs/preview-base/main HEAD 2>/dev/null || true)
  # A shallow history can still miss the fork point; the main tip bounds the diff.
  [ -n "$base" ] || base=$(git rev-parse --verify --quiet refs/preview-base/main || true)
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
