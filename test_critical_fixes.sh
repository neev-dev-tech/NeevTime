#!/bin/bash

# Critical Bug Fixes Test Script
# Tests all security and functionality fixes

echo "================================================"
echo "Testing Critical Bug Fixes - TimeNexa HRMS"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001"
TOKEN=""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3
    local description=$4
    
    echo -n "Testing: $name... "
    
    response=$(curl -s -w "\n%{http_code}" "$url")
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Status: $status_code)"
        [ ! -z "$description" ] && echo "  → $description"
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $status_code)"
        echo "  Response: $body"
    fi
    echo ""
}

echo "1. Testing SQL Injection Fix"
echo "------------------------------"
test_endpoint \
    "Normal Query" \
    "$API_URL/api/reports/first-last?startDate=2024-01-01&endDate=2024-01-31" \
    200 \
    "Should return valid data"

test_endpoint \
    "SQL Injection Attempt" \
    "$API_URL/api/reports/first-last?startDate=2024-01-01';DROP%20TABLE%20employees;--" \
    500 \
    "Should fail safely without executing malicious SQL"

echo ""
echo "2. Testing Authentication"
echo "-------------------------"
test_endpoint \
    "Reports Without Auth" \
    "$API_URL/api/reports/daily-attendance" \
    401 \
    "Should require authentication"

test_endpoint \
    "Dashboard Without Auth" \
    "$API_URL/api/reports/dashboard" \
    401 \
    "Should require authentication"

echo ""
echo "3. Testing Input Validation"
echo "---------------------------"
test_endpoint \
    "Invalid Year" \
    "$API_URL/api/reports/monthly-summary?year=1900&month=1" \
    400 \
    "Should reject year before 2020"

test_endpoint \
    "Invalid Month" \
    "$API_URL/api/reports/monthly-summary?year=2024&month=13" \
    400 \
    "Should reject month > 12"

test_endpoint \
    "Date Range Too Large" \
    "$API_URL/api/reports/late-early?start_date=2020-01-01&end_date=2025-12-31" \
    400 \
    "Should reject date range > 1 year"

echo ""
echo "4. Testing CSV Export"
echo "---------------------"
echo "Note: CSV export requires authentication. Skipping for now."
echo "Manual test: Generate a report and click 'Export CSV'"
echo ""

echo ""
echo "5. Testing PDF Export"
echo "---------------------"
echo "Note: PDF export is client-side. Test manually:"
echo "  1. Generate a report with < 1000 rows"
echo "  2. Click 'Export PDF' - should work"
echo "  3. Generate a report with > 1000 rows"
echo "  4. Click 'Export PDF' - should show warning"
echo ""

echo ""
echo "6. Testing Excel Export"
echo "-----------------------"
echo "Note: Excel export is client-side. Test manually:"
echo "  1. Generate any report"
echo "  2. Click 'Export XLSX'"
echo "  3. Check file opens in Excel correctly"
echo "  4. Verify metadata sheet exists"
echo ""

echo "================================================"
echo "Test Summary"
echo "================================================"
echo ""
echo "Automated tests completed."
echo ""
echo "Manual tests required:"
echo "  - CSV export with special characters"
echo "  - PDF export with large datasets"
echo "  - Excel export with metadata"
echo "  - Error boundary (trigger an error)"
echo ""
echo "Next steps:"
echo "  1. Review failed tests above"
echo "  2. Run manual tests in browser"
echo "  3. Check server logs for errors"
echo "  4. Deploy to staging if all pass"
echo ""
echo "================================================"
