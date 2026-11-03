#!/usr/bin/env bash
# Smoke: Ask/Talk chat proxy returns set_reminder with a date-shaped remindAt.
# On-device parsing overrides model label/date — log them, don't fail on mismatches.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

env_get() {
  local key="$1"
  if [[ ! -f .env ]]; then
    echo ""
    return
  fi
  grep -E "^${key}=" .env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/\r$//'
}

URL=$(env_get EXPO_PUBLIC_CHAT_API_URL)
URL="${URL:-https://saavi-chat-pranesh.fly.dev/chat}"
TOKEN=$(env_get EXPO_PUBLIC_CHAT_API_TOKEN)
TOKEN="${TOKEN:-$(env_get CHAT_API_TOKEN)}"
SB_URL=$(env_get EXPO_PUBLIC_SUPABASE_URL)
SB_KEY=$(env_get EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)

if [[ -z "$TOKEN" ]]; then
  echo "FAIL: missing EXPO_PUBLIC_CHAT_API_TOKEN / CHAT_API_TOKEN"
  exit 1
fi

ACCESS_TOKEN=""
if [[ -n "$SB_URL" && -n "$SB_KEY" ]]; then
  ACCESS_TOKEN=$(curl -sS -X POST "${SB_URL%/}/auth/v1/signup" \
    -H "apikey: $SB_KEY" \
    -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d '{"data":{}}' | jq -r '.access_token // empty') || true
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "FAIL: could not mint Supabase anon JWT for Talk (required when Fly has SUPABASE_URL)"
  exit 1
fi

UTTERANCES=(
  "Create a reminder for 12th Nov for Meraas Payment"
  "Remind me to pay Meraas on Nov 12"
  "Remind me to submit report tomorrow"
  "Remind me to pay Meraas every Monday"
  "Create a reminder for Meraas payment on 12/11"
  "Remind me to pay Meraas"
)

pass=0
fail=0
echo "Chat URL: $URL"
echo "----"

for u in "${UTTERANCES[@]}"; do
  body=$(jq -n \
    --arg msg "$u" \
    --arg today "2026-11-03" \
    '{
      messages: [{ role: "user", content: $msg }],
      inventorySummary: "",
      localDate: $today,
      mode: "talk"
    }')

  resp=$(curl -sS -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Saavi-Proxy-Token: $TOKEN" \
    -d "$body" \
    --connect-timeout 15 \
    --max-time 90) || {
      echo "FAIL  | curl error | $u"
      fail=$((fail + 1))
      continue
    }

  err=$(echo "$resp" | jq -r '.error // empty')
  has=$(echo "$resp" | jq -r '
    ([.actions[]? | select(.type=="set_reminder")]
     + [.action | select(.type=="set_reminder")])
    | length')

  remindAt=$(echo "$resp" | jq -r '
    ([.actions[]? | select(.type=="set_reminder") | .remindAt]
     + [.action | select(.type=="set_reminder") | .remindAt])
    | map(select(. != null and . != ""))
    | .[0] // empty')

  label=$(echo "$resp" | jq -r '
    ([.actions[]? | select(.type=="set_reminder") | .label]
     + [.action | select(.type=="set_reminder") | .label])
    | map(select(. != null and . != ""))
    | .[0] // empty')

  date_ok=0
  date_missing=0
  if [[ -z "$remindAt" ]]; then
    # Dateless creates often omit remindAt; applyActions defaults to localDate.
    date_missing=1
  elif echo "$remindAt" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
    date_ok=1
  fi

  if [[ "$has" -ge 1 && ( "$date_ok" -eq 1 || "$date_missing" -eq 1 ) ]]; then
    echo "PASS  | set_reminder remindAt=${remindAt:-<omit→today>} label=${label:-?} | $u"
    pass=$((pass + 1))
  else
    echo "FAIL  | has=$has remindAt=${remindAt:-none} err=${err:-none} | $u"
    echo "       snippet: $(echo "$resp" | head -c 220 | tr '\n' ' ')"
    fail=$((fail + 1))
  fi
  echo "       (model label/date logged only — on-device overrides, not asserted)"
done

echo "----"
echo "curl smoke: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
