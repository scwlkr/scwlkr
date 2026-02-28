#!/bin/bash

# ==============================================================================
# BUBBA DASHBOARD : PRODUCTION AUDIT SCRIPT
# Purpose: Verifies the live routing, connectivity, and CORS headers 
#          for scwlkr.com/bubba-dashboard
# ==============================================================================

# Configurations
TARGET_DOMAIN="https://scwlkr.com"
BASE_PATH="/bubba-dashboard"
USER_PATH="/bubba-dashboard/user"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}  BUBBA DASHBOARD - PRODUCTION AUDIT TOOL       ${NC}"
echo -e "${YELLOW}================================================${NC}\n"

# 1. LIVE URL CHECK: ADMIN VIEW
echo -n "Checking live accessibility for Admin View ($BASE_PATH)... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$TARGET_DOMAIN$BASE_PATH")

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}PASS (200 OK)${NC}"
else
    echo -e "${RED}FAIL (HTTP $HTTP_CODE)${NC}"
    echo " -> Warning: The Admin dashboard might not be deployed or the path is incorrect."
fi

# 2. ROUTING INTEGRITY CHECK: USER VIEW (SPA Fallback verification)
echo -n "Checking Single Page App routing fallback for User View ($USER_PATH)... "
HTTP_CODE_USER=$(curl -s -o /dev/null -w "%{http_code}" -L "$TARGET_DOMAIN$USER_PATH")

if [ "$HTTP_CODE_USER" -eq 200 ]; then
    echo -e "${GREEN}PASS (200 OK)${NC}"
else
    echo -e "${RED}FAIL (HTTP $HTTP_CODE_USER)${NC}"
    echo " -> Warning: Direct visits to sub-routes are failing. Check Vercel rewrites (vercel.json) to ensure unmapped paths fallback to index.html."
fi

# 3. VERIFY ENVIRONMENT VARIABLES
echo -n "Checking local environment variable bindings (.env.local)... "
if [ -f "../.env.local" ] || [ -f ".env.local" ]; then
    echo -e "${GREEN}PASS (Found)${NC}"
else
    echo -e "${YELLOW}WARNING (Missing .env.local)${NC}"
    echo " -> Note: This won't affect Production as Vercel handles remote ENV via its dashboard, but local builds will fail to hit the GS backend."
fi

# 4. CORS PRE-FLIGHT EXPECTATIONS
echo -e "\n${YELLOW}=== CORS & Header Verification Note ===${NC}"
echo "Since the backend relies on Google Apps Script (Web App), the script inherently forces Google's strict CORS policies."
echo "Ensure your React src/api/sheetApi.ts sends POSTs specifically as 'text/plain'. "
echo "Validating Google Sheets CORS automatically via bash is notoriously unstable; prioritize verifying visually in the browser console during a state toggle."

echo -e "\n${GREEN}Audit script complete.${NC}\n"
