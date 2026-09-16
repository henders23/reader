#!/usr/bin/env bash
# HTTP smoke test against a running server. Usage: test/smoke.sh [base-url]
set -euo pipefail
BASE=${1:-http://localhost:8081}
cd "$(dirname "$0")/.."
R=$(curl -sf -F pdf=@test/fixtures/paper.pdf -F name=Alice "$BASE/api/sessions")
TOKEN=$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
CODE=$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).passcode')
J=$(curl -sf -H 'content-type: application/json' -d "{\"passcode\":\"$CODE\",\"name\":\"Bob\"}" "$BASE/api/join")
BT=$(echo "$J" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
echo "$TOKEN" > /tmp/alice.token; echo "$BT" > /tmp/bob.token; echo "$CODE" > /tmp/code
echo "passcode: $CODE"
curl -sf -o /tmp/out.pdf -w 'pdf download: %{http_code} %{size_download} bytes\n' -H "authorization: Bearer $BT" "$BASE/api/session/pdf"
cmp /tmp/out.pdf test/fixtures/paper.pdf && echo "pdf identical: yes"
echo "bad passcode: $(curl -s -H 'content-type: application/json' -d '{"passcode":"nope-nope-nope","name":"X"}' "$BASE/api/join")"
echo "not a pdf: $(curl -s -F pdf=@package.json -F name=A "$BASE/api/sessions")"
echo "bob regen passcode: $(curl -s -X POST -H "authorization: Bearer $BT" "$BASE/api/session/passcode")"
echo "alice regen passcode: $(curl -s -X POST -H "authorization: Bearer $TOKEN" "$BASE/api/session/passcode")"
echo "export:"; curl -sf -H "authorization: Bearer $BT" "$BASE/api/session/export.md" | head -5
