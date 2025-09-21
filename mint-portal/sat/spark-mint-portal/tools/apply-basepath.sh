#!/usr/bin/env bash
set -euo pipefail

ROOT="src"
mapfile -d '' files < <(grep -RIlF --null "fetch('/api/" "$ROOT" || true)

for f in "${files[@]}"; do
  if ! grep -q "from '@/lib/basePath'" "$f"; then
    sed -i "1i import { apiPath } from '@/lib/basePath';" "$f"
  fi
  sed -i "s|fetch('/api/|fetch(apiPath('/api/|g" "$f"
done

echo "Patched ${#files[@]} file(s):"
printf ' - %s\n' "${files[@]:-}"
