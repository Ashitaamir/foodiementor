#!/bin/zsh
# Test the parse-meal Edge Function as a signed-in test user.
# Usage: zsh scripts/test-parse-meal.sh "2 rotis and a bowl of dal"
# Reads the project URL and publishable key from .env and never prints them.
set -euo pipefail

# Read KEY from .env, tolerating spaces around "=" and surrounding quotes
env_value() {
  grep -E "^[[:space:]]*$1[[:space:]]*=" .env | head -1 | cut -d= -f2- \
    | sed -E 's/^[[:space:]"]+//; s/[[:space:]"]+$//'
}

URL=$(env_value EXPO_PUBLIC_SUPABASE_URL)
KEY=$(env_value EXPO_PUBLIC_SUPABASE_ANON_KEY)
if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "Could not find EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env" >&2
  exit 1
fi

TEXT=${1:-"2 rotis and a bowl of dal"}
read "EMAIL?Test user email: "
read -s "PW?Test user password: "
echo

# 1. Sign in as the test user
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))' "$EMAIL" "$PW")" \
  | python3 -c '
import json, sys
raw = sys.stdin.read()
if not raw:
    sys.exit("Sign-in failed: no response from Supabase (check the URL in .env)")
data = json.loads(raw)
if not data.get("access_token"):
    sys.exit("Sign-in failed: " + str(data.get("msg") or data.get("error_description") or data))
print(data["access_token"])
')

# 2. Call parse-meal
RESPONSE=$(curl -s -w "\n%{http_code}" "$URL/functions/v1/parse-meal" \
  -H "Authorization: Bearer $TOKEN" -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$TEXT")")
STATUS=${RESPONSE##*$'\n'}
BODY=${RESPONSE%$'\n'*}
echo "HTTP $STATUS"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
