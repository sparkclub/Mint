#!/usr/bin/env bash
set -euo pipefail


while IFS= read -r -d '' f; do
  if grep -q "^[[:space:]]*'use client';" "$f"; then
    sed -i "/^[[:space:]]*'use client';[[:space:]]*$/d" "$f"
    sed -i "1i 'use client';" "$f"
    echo "fixed: $f"
  fi
done < <(find src -type f -name "*.tsx" -print0)
