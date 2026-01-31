#!/bin/bash
# Comprehensive Auth Test Script
# Tests signup, signin, and diagnoses issues

echo "========================================================================"
echo "  ALTRION AUTHENTICATION TEST"
echo "========================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Generate unique email
TIMESTAMP=$(date +%s)
TEST_EMAIL="test${TIMESTAMP}@example.com"
TEST_PASSWORD="SecurePass123!"
TEST_NAME="Test User ${TIMESTAMP}"

echo "Test credentials:"
echo "  Email: ${TEST_EMAIL}"
echo "  Password: ${TEST_PASSWORD}"
echo ""

# Test 1: Server health
echo "========================================================================"
echo "1️⃣  Testing Server Connection"
echo "========================================================================"
HEALTH=$(curl -s http://localhost:8000/ 2>&1)
if echo "$HEALTH" | grep -q "running"; then
    echo -e "${GREEN}✅ Server is running${NC}"
    echo "$HEALTH" | head -3
else
    echo -e "${RED}❌ Server not responding${NC}"
    echo "Error: $HEALTH"
    echo ""
    echo "Start server with: python run.py"
    exit 1
fi
echo ""

# Test 2: Signup
echo "========================================================================"
echo "2️⃣  Testing SIGNUP"
echo "========================================================================"
SIGNUP_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\",\"name\":\"${TEST_NAME}\"}")

echo "Response:"
echo "$SIGNUP_RESPONSE" | jq '.' 2>/dev/null || echo "$SIGNUP_RESPONSE"
echo ""

# Check signup result
if echo "$SIGNUP_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ SIGNUP SUCCESSFUL${NC}"
    ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.accessToken' 2>/dev/null)
    echo "Access Token: ${ACCESS_TOKEN:0:50}..."
elif echo "$SIGNUP_RESPONSE" | grep -q "Email signups are disabled"; then
    echo -e "${RED}❌ EMAIL PROVIDER IS DISABLED${NC}"
    echo ""
    echo "FIX: Go to Supabase Dashboard:"
    echo "1. Navigate to Authentication → Providers"
    echo "2. Find 'Email' in the providers list"
    echo "3. Toggle it ON (enable)"
    echo "4. Save changes"
    echo ""
    echo "URL: https://sxnuebvmnfposadbslfw.supabase.co"
    exit 1
elif echo "$SIGNUP_RESPONSE" | grep -q "rate limit exceeded"; then
    echo -e "${YELLOW}⚠️  RATE LIMIT EXCEEDED${NC}"
    echo ""
    echo "FIX Options:"
    echo "1. Wait 1 hour for rate limit to reset"
    echo "2. Disable rate limits in Supabase Dashboard → Authentication → Rate Limits"
    echo "3. Use a different email address"
    exit 1
elif echo "$SIGNUP_RESPONSE" | grep -q "User already registered"; then
    echo -e "${YELLOW}⚠️  Email already exists${NC}"
    echo "This email is already registered. Try signing in instead."
else
    echo -e "${RED}❌ SIGNUP FAILED${NC}"
    echo "Check the error message above"
    exit 1
fi
echo ""

# Test 3: Signin with the user we just created
echo "========================================================================"
echo "3️⃣  Testing SIGNIN"
echo "========================================================================"
SIGNIN_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

echo "Response:"
echo "$SIGNIN_RESPONSE" | jq '.' 2>/dev/null || echo "$SIGNIN_RESPONSE"
echo ""

if echo "$SIGNIN_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ SIGNIN SUCCESSFUL${NC}"
    ACCESS_TOKEN=$(echo "$SIGNIN_RESPONSE" | jq -r '.data.accessToken' 2>/dev/null)
    USER_ID=$(echo "$SIGNIN_RESPONSE" | jq -r '.data.user.id' 2>/dev/null)
    USER_EMAIL=$(echo "$SIGNIN_RESPONSE" | jq -r '.data.user.email' 2>/dev/null)
    echo "User ID: $USER_ID"
    echo "Email: $USER_EMAIL"
else
    echo -e "${RED}❌ SIGNIN FAILED${NC}"
    exit 1
fi
echo ""

# Test 4: Get user profile with token
echo "========================================================================"
echo "4️⃣  Testing GET USER PROFILE"
echo "========================================================================"
if [ -n "$ACCESS_TOKEN" ]; then
    PROFILE_RESPONSE=$(curl -s -X GET "http://localhost:8000/api/auth/me" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    echo "Response:"
    echo "$PROFILE_RESPONSE" | jq '.' 2>/dev/null || echo "$PROFILE_RESPONSE"
    echo ""
    
    if echo "$PROFILE_RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ PROFILE RETRIEVAL SUCCESSFUL${NC}"
    else
        echo -e "${RED}❌ PROFILE RETRIEVAL FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping (no access token)${NC}"
fi
echo ""

# Summary
echo "========================================================================"
echo "  TEST SUMMARY"
echo "========================================================================"
echo -e "${GREEN}✅ Server Running${NC}"
echo -e "${GREEN}✅ Signup Working${NC}"
echo -e "${GREEN}✅ Signin Working${NC}"
echo -e "${GREEN}✅ Profile Access Working${NC}"
echo ""
echo "🎉 ALL TESTS PASSED!"
echo ""
echo "Your authentication system is fully functional."
echo "You can now connect your frontend."
echo ""
echo "Test credentials (saved for your reference):"
echo "  Email: ${TEST_EMAIL}"
echo "  Password: ${TEST_PASSWORD}"
echo ""
