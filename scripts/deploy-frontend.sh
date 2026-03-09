#!/bin/bash
# deploy-frontend.sh — Build and deploy FIS frontend to GitHub Pages
set -e

echo "=== Water4 FIS — Deploy Frontend ==="

cd "$(dirname "$0")/../frontend"

echo "Building..."
npm run build

TOKEN=$(gh auth token)
TMPDIR=$(mktemp -d)
DIST="$(pwd)/dist"

cd "$TMPDIR"
git init
git checkout --orphan gh-pages
cp -r "$DIST"/. .
git add -A
git commit -m "Deploy FIS: $(date '+%Y-%m-%d %H:%M')"
git remote add origin "https://${TOKEN}@github.com/matthangen/water4-fundraising-intelligence.git"
git push origin gh-pages --force
cd "$OLDPWD"
rm -rf "$TMPDIR"

echo ""
echo "✅ Deployed to https://matthangen.github.io/water4-fis/"
