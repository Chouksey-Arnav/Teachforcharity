#!/usr/bin/env bash
# Regenerates src/lib/database.types.ts from the local Supabase stack (`npx supabase start`).
set -euo pipefail
cd "$(dirname "$0")/.."
key=$(npx supabase status -o json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))')
curl -fsS "http://127.0.0.1:54321/pg/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true&postgrest_version=14.5" \
  -H "apikey: $key" -H "Authorization: Bearer $key" \
  | npx --yes prettier@3 --parser typescript --no-semi > src/lib/database.types.ts
echo "Wrote src/lib/database.types.ts"
