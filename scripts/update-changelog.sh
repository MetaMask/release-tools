#!/usr/bin/env bash

set -euo pipefail

# Get the current package name
if [[ $# -eq 0 ]]; then
  echo "Missing package name."
  exit 1
fi

package_name="$1"
shift # remove package name from arguments

# Use the published CLI pinned by the root `package.json`, so this script does
# not depend on a build of the workspace package.
auto_changelog="$(git rev-parse --show-toplevel)/node_modules/@metamask/auto-changelog-npm/dist/cli.mjs"

# Get the current git branch
branch=$(git rev-parse --abbrev-ref HEAD)

if [[ $branch =~ ^release/ ]]; then
  "${auto_changelog}" update --formatter oxfmt --tag-prefix "${package_name}@" --rc "$@"
else
  "${auto_changelog}" update --formatter oxfmt --tag-prefix "${package_name}@" "$@"
fi
