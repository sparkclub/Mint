#!/usr/bin/env bash
set -euo pipefail

echo "== Env =="
echo "node: $(node -v) | npm: $(npm -v)"
echo

mkdir -p .checks

echo "== TypeScript compile =="
npx tsc --noEmit --pretty false | tee .checks/tsc.txt || true
echo

echo "== Next.js lint =="
npx next lint | tee .checks/eslint.txt || true
echo

echo "== Grep pola rawan =="
grep -RIn --include='*.ts*' 'upsertEnvVars(' src || true
grep -RIn --include='*.ts*' -E 'sprt1|sp1' src || true
grep -RIn --include='*.ts*' "from '@/lib/validate'" src || true
echo

echo "== Selesai. Lihat folder .checks/ untuk ringkasan =="
