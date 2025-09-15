#!/usr/bin/env bash
set -euo pipefail

ROOT="src"

mapfile -d '' FILES < <(grep -RIl --null "fetch(apiPath('/api/" "$ROOT" || true)

for f in "${FILES[@]}"; do
  sed -E -i "s|fetch\\(apiPath\\('/api/([^']*)',\\s*\\{|fetch(apiPath('/api/\\1'), {|g" "$f"
done

echo "Fixed ${#FILES[@]} file(s):"
printf ' - %s\n' "${FILES[@]:-}"
