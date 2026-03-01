#!/bin/bash

# Test Runner Script for MoneyHero Backend
# Runs all test suites and generates a summary

set -e

echo "================================"
echo "MoneyHero Backend Test Suite"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server is running
echo "⏳ Checking if server is running..."
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Server is running"
else
    echo -e "${RED}✗${NC} Server is not running on port 3001"
    echo "Please start the server with: docker compose up -d"
    exit 1
fi

echo ""
echo "================================"
echo "Running Test Suites..."
echo "================================"
echo ""

# Function to run tests
run_test() {
    local test_name=$1
    local test_file=$2

    echo "📝 Running $test_name..."
    if node --test "$test_file" 2>&1 | tee /tmp/test_output.txt; then
        echo -e "${GREEN}✓${NC} $test_name passed"
        return 0
    else
        echo -e "${RED}✗${NC} $test_name failed"
        return 1
    fi
    echo ""
}

# Track results
total_tests=0
passed_tests=0
failed_tests=0

# Run each test suite
tests=(
    "API Tests:tests/api.test.js"
    "Integration Tests:tests/integration.test.js"
    "Database Tests:tests/database.test.js"
    "SSE Tests:tests/sse.test.js"
    "Validation Tests:tests/validation.test.js"
)

for test in "${tests[@]}"; do
    IFS=':' read -r name file <<< "$test"
    total_tests=$((total_tests + 1))

    if run_test "$name" "$file"; then
        passed_tests=$((passed_tests + 1))
    else
        failed_tests=$((failed_tests + 1))
    fi
done

# Summary
echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo "Total test suites: $total_tests"
echo -e "${GREEN}Passed: $passed_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
