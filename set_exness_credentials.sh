#!/usr/bin/env bash
set -e

if [ "$#" -lt 3 ]; then
  echo "Usage: bash set_exness_credentials.sh <API_KEY> <PRIVATE_KEY> <ACCOUNT_ID>"
  exit 1
fi

API_KEY="$1"
PRIVATE_KEY="$2"
ACCOUNT_ID="$3"

cat << EOF > /home/user/smc-app-live/.env
EXN_API_KEY="${API_KEY}"
EXN_PRIVATE_KEY="${PRIVATE_KEY}"
EXN_ACCOUNT_ID="${ACCOUNT_ID}"
EXN_DISCOVERY_BASE_URL="https://gateway.exness.com"
EXN_IS_DEMO=true
NODE_ENV=development
PORT=3000
VITE_API_URL=http://localhost:3000
EOF

chmod 600 /home/user/smc-app-live/.env
echo "✅ Credentials securely written to /home/user/smc-app-live/.env (mode 600, gitignored)"
echo "🚀 Executing live authenticated Exness Demo test suite..."
echo ""
cd /home/user/smc-app-live && npx tsx test_live_exness_demo.ts
