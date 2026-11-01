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

# 3. Optional: save the "ready" items as confirmed food logs (run with SAVE=1).
#    The app will do the same single request. Calories are calculated by the
#    database triggers, not taken from this request.
if [[ "${SAVE:-0}" == "1" ]]; then
  ROWS=$(echo "$BODY" | python3 -c '
import json, sys
rows = []
for item in json.load(sys.stdin)["items"]:
    if item["status"] != "ready":
        continue  # e.g. "bowl of dal" needs a size first, so it is not saved
    row = {"food_id": item["food"]["id"], "status": "confirmed", "input_method": "chat"}
    if item["portion"]:
        row.update(portion_id=item["portion"]["id"], portion_count=item["quantity"])
    else:
        row["grams"] = item["grams"]
    rows.append(row)
print(json.dumps(rows))
')
  echo "Saved:"
  curl -s "$URL/rest/v1/food_logs?select=grams,energy_kcal,portion_count,status" -X POST \
    -H "Authorization: Bearer $TOKEN" -H "apikey: $KEY" -H "Content-Type: application/json" \
    -H "Prefer: return=representation" -d "$ROWS" | python3 -m json.tool
fi

# 4. Optional: show today's totals for the test user (run with TOTALS=1)
if [[ "${TOTALS:-0}" == "1" ]]; then
  echo "Today's totals:"
  curl -s "$URL/rest/v1/rpc/daily_totals" -X POST \
    -H "Authorization: Bearer $TOKEN" -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d '{}' | python3 -m json.tool
fi
