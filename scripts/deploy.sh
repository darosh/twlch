#!/usr/bin/env bash
# Build the demo for GitHub Pages and publish it to the gh-pages branch.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
remote="${REMOTE:-origin}"
url="$(git -C "$root" remote get-url "$remote")"
rev="$(git -C "$root" rev-parse --short HEAD)"

(cd "$root/apps/demo" && TWLCH_BASE="${TWLCH_BASE:-/twlch/}" vp build)

dist="$root/apps/demo/dist"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -R "$dist"/. "$tmp"
touch "$tmp/.nojekyll"
cp "$tmp/index.html" "$tmp/404.html"

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy demo from $rev"
git push -f "$url" gh-pages:gh-pages
echo "Published to $remote/gh-pages"
