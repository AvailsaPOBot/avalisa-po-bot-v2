#!/usr/bin/env bash
# Smoke test — Avalisa backend critical routes
# Usage: ./test/smoke-test.sh
# Requires: curl, jq
# Set ADMIN_EMAIL / ADMIN_PASSWORD env vars for admin tests (or edit defaults below)

BASE="https://avalisa-backend.onrender.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@avalisabot.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TEST_EMAIL="smoketest_$(date +%s)@test.com"
TEST_PASSWORD="SmokeTest123!"
FAKE_UID="smoke$(date +%s)"

PASS=0
FAIL=0

green="\033[0;32m"
red="\033[0;31m"
reset="\033[0m"

pass() { echo -e "${green}[PASS]${reset} $1"; ((PASS++)); }
fail() { echo -e "${red}[FAIL]${reset} $1 — $2"; ((FAIL++)); }

echo ""
echo "========================================="
echo "  Avalisa Smoke Test — $BASE"
echo "========================================="
echo ""

# ── 1. Register test user ─────────────────────────────────────────────────────
REGISTER=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

USER_TOKEN=$(echo "$REGISTER" | jq -r '.token // empty')
if [ -n "$USER_TOKEN" ]; then
  pass "Register test user ($TEST_EMAIL)"
else
  fail "Register test user" "$(echo "$REGISTER" | jq -r '.error // .')"
  echo "Cannot continue without user token. Aborting."
  exit 1
fi

# ── 2. Login + capture token ──────────────────────────────────────────────────
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

LOGIN_TOKEN=$(echo "$LOGIN" | jq -r '.token // empty')
if [ -n "$LOGIN_TOKEN" ]; then
  pass "Login + capture token"
  USER_TOKEN="$LOGIN_TOKEN"
else
  fail "Login" "$(echo "$LOGIN" | jq -r '.error // .')"
fi

USER_ID=$(echo "$LOGIN" | jq -r '.user.id // empty')

# ── 3. GET /api/license/claim/status ─────────────────────────────────────────
CLAIM_STATUS=$(curl -s -X GET "$BASE/api/license/claim/status" \
  -H "Authorization: Bearer $USER_TOKEN")

STATUS_VAL=$(echo "$CLAIM_STATUS" | jq -r '.claimStatus // empty')
if [ "$STATUS_VAL" = "none" ]; then
  pass "GET /api/license/claim/status (claimStatus=none)"
else
  fail "GET /api/license/claim/status" "expected 'none', got '$STATUS_VAL' — $(echo "$CLAIM_STATUS" | jq -r '.error // .')"
fi

# ── 4. POST /api/license/claim with fake UID ──────────────────────────────────
CLAIM=$(curl -s -X POST "$BASE/api/license/claim" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"poUid\":\"$FAKE_UID\"}")

CLAIM_MSG=$(echo "$CLAIM" | jq -r '.message // empty')
if [ -n "$CLAIM_MSG" ]; then
  pass "POST /api/license/claim (fake UID submitted)"
else
  fail "POST /api/license/claim" "$(echo "$CLAIM" | jq -r '.error // .')"
fi

# ── 5. GET /api/admin/claims (admin token) ────────────────────────────────────
ADMIN_TOKEN=""
if [ -n "$ADMIN_PASSWORD" ]; then
  ADMIN_LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | jq -r '.token // empty')
fi

if [ -n "$ADMIN_TOKEN" ]; then
  CLAIMS=$(curl -s -X GET "$BASE/api/admin/claims" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  CLAIMS_COUNT=$(echo "$CLAIMS" | jq 'length // 0')
  if echo "$CLAIMS" | jq -e 'type == "array"' > /dev/null 2>&1; then
    pass "GET /api/admin/claims ($CLAIMS_COUNT pending)"
  else
    fail "GET /api/admin/claims" "$(echo "$CLAIMS" | jq -r '.error // .')"
  fi

  # ── 6. POST /api/admin/claims/approve ──────────────────────────────────────
  if [ -n "$USER_ID" ]; then
    APPROVE=$(curl -s -X POST "$BASE/api/admin/claims/approve" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"userId\":\"$USER_ID\"}")

    APPROVE_MSG=$(echo "$APPROVE" | jq -r '.message // empty')
    if [ -n "$APPROVE_MSG" ]; then
      pass "POST /api/admin/claims/approve"
    else
      fail "POST /api/admin/claims/approve" "$(echo "$APPROVE" | jq -r '.error // .')"
    fi

    # ── 7. GET /api/license/claim/status — verify plan = lifetime ────────────
    FINAL_STATUS=$(curl -s -X GET "$BASE/api/license/claim/status" \
      -H "Authorization: Bearer $USER_TOKEN")

    FINAL_PLAN=$(echo "$FINAL_STATUS" | jq -r '.plan // empty')
    FINAL_CLAIM=$(echo "$FINAL_STATUS" | jq -r '.claimStatus // empty')
    if [ "$FINAL_PLAN" = "lifetime" ] && [ "$FINAL_CLAIM" = "approved" ]; then
      pass "GET /api/license/claim/status — plan=lifetime, claimStatus=approved ✅"
    else
      fail "Final status check" "expected plan=lifetime/approved, got plan=$FINAL_PLAN claimStatus=$FINAL_CLAIM"
    fi
  else
    fail "POST /api/admin/claims/approve" "no userId captured from login"
    fail "Final status check" "skipped — approve failed"
  fi
else
  echo ""
  echo "  ⚠️  ADMIN_PASSWORD not set — skipping admin tests (steps 5-7)"
  echo "  Set: export ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpass"
  echo "  Then rerun: ./test/smoke-test.sh"
  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo -e "  Results: ${green}$PASS passed${reset} / ${red}$FAIL failed${reset}"
echo "========================================="
echo ""

[ "$FAIL" -eq 0 ]
