#!/bin/bash
#
# System Testing Script
# Runs comprehensive tests on deployed Legal Intelligence System
#

set -e

WORKER_URL="${WORKER_URL:-https://legal-intelligence-alpha.joe-1a2.workers.dev}"

echo "🧪 HOLE Legal Intelligence - System Tests"
echo "=========================================="
echo ""
echo "Testing Worker: $WORKER_URL"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

test_endpoint() {
    local NAME="$1"
    local TEST_CMD="$2"
    
    echo -n "Testing $NAME... "
    
    if eval "$TEST_CMD" &> /dev/null; then
        echo "✅ PASSED"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ FAILED"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 1: Health check
test_endpoint "Health Check" \
    "curl -sf $WORKER_URL/health | jq -e '.status == \"online\"'"

# Test 2: MCP Initialize
test_endpoint "MCP Initialize" \
    "curl -sf -X POST $WORKER_URL -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}' | jq -e '.result.serverInfo.name'"

# Test 3: Tools List
test_endpoint "Tools List" \
    "curl -sf -X POST $WORKER_URL -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}' | jq -e '.result.tools | length == 4'"

# Test 4: Database Connection
PSQL_CMD="psql"
if [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/opt/homebrew/opt/postgresql@15/bin/psql"
fi

test_endpoint "Database Connection" \
    "secretspec run -- sh -c '$PSQL_CMD \"\$NEON_DATABASE_URL\" -c \"SELECT COUNT(*) FROM project_alt.documents\"'"

echo ""
echo "=========================================="
echo "Results: $TESTS_PASSED passed, $TESTS_FAILED failed"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ Some tests failed. Check the output above."
    exit 1
fi
