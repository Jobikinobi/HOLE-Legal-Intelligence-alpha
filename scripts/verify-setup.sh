#!/bin/bash
#
# Setup Verification Script
# Checks all prerequisites for HOLE Legal Intelligence System
#

set -e

echo "🔍 HOLE Legal Intelligence - Setup Verification"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 installed"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not found"
        return 1
    fi
}

check_secret() {
    if secretspec check 2>&1 | grep -q "✓ $1"; then
        echo -e "${GREEN}✓${NC} $1 configured in SecretSpec"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $1 not configured in SecretSpec"
        return 1
    fi
}

ERRORS=0

echo "📦 Checking Prerequisites..."
echo ""

# Check required commands
check_command "node" || ERRORS=$((ERRORS + 1))
check_command "pnpm" || ERRORS=$((ERRORS + 1))
check_command "wrangler" || ERRORS=$((ERRORS + 1))
check_command "secretspec" || ERRORS=$((ERRORS + 1))
# Check for psql (might be in Homebrew path)
if command -v psql &> /dev/null || [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    echo -e "${GREEN}✓${NC} psql installed"
else
    echo -e "${RED}✗${NC} psql not found"
    ERRORS=$((ERRORS + 1))
fi
check_command "curl" || ERRORS=$((ERRORS + 1))
check_command "jq" || ERRORS=$((ERRORS + 1))
check_command "git" || ERRORS=$((ERRORS + 1))

echo ""
echo "🔐 Checking Secrets..."
echo ""

# Check required secrets
check_secret "OPENAI_API_KEY" || ERRORS=$((ERRORS + 1))
check_secret "ANTHROPIC_API_KEY" || ERRORS=$((ERRORS + 1))
check_secret "PINECONE_API_KEY" || ERRORS=$((ERRORS + 1))
check_secret "UNSTRUCTURED_API_KEY" || ERRORS=$((ERRORS + 1))
check_secret "NEON_DATABASE_URL" || ERRORS=$((ERRORS + 1))

echo ""
echo "📁 Checking Project Files..."
echo ""

# Check required files
for file in "package.json" "wrangler.toml" "secretspec.toml" "migrations/001_multi_tenant_schema.sql"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file missing"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "🌐 Checking Wrangler Authentication..."
echo ""

if wrangler whoami &> /dev/null; then
    echo -e "${GREEN}✓${NC} Wrangler authenticated"
else
    echo -e "${YELLOW}⚠${NC} Wrangler not authenticated (run: wrangler login)"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "🗄️ Checking Database Connection..."
echo ""

# Use proper psql path with sh -c wrapper
PSQL_CMD="psql"
if [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/opt/homebrew/opt/postgresql@15/bin/psql"
fi

if secretspec run -- sh -c "$PSQL_CMD \"\$NEON_DATABASE_URL\" -c \"SELECT 1\"" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Cannot connect to database"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "================================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! System is ready.${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS issues. Please fix them before proceeding.${NC}"
    echo ""
    echo "See SETUP.md for installation instructions."
    exit 1
fi
