#!/bin/bash
#
# Deployment Script
# Builds and deploys HOLE Legal Intelligence System to Cloudflare
#

set -e

echo "🚀 HOLE Legal Intelligence - Deployment"
echo "========================================"
echo ""

# Run verification first
if ! ./scripts/verify-setup.sh; then
    echo "❌ Setup verification failed. Fix issues before deploying."
    exit 1
fi

echo ""
echo "📦 Building TypeScript..."
pnpm run build

echo ""
echo "☁️ Deploying to Cloudflare Workers..."
wrangler deploy

echo ""
echo "🧪 Testing deployment..."
WORKER_URL="https://legal-intelligence-alpha.joe-1a2.workers.dev"

# Test health endpoint
if curl -sf "$WORKER_URL/health" | jq -e '.status == "online"' > /dev/null; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

# Test MCP initialize
INIT_RESPONSE=$(curl -sf -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')

if echo "$INIT_RESPONSE" | jq -e '.result.serverInfo.name == "legal-intelligence-alpha"' > /dev/null; then
    echo "✅ MCP server initialized"
else
    echo "❌ MCP initialization failed"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ Deployment successful!"
echo ""
echo "🌐 Worker URL: $WORKER_URL"
echo "📊 Status: $(curl -sf "$WORKER_URL/health" | jq -r '.status')"
echo ""
echo "Next steps:"
echo "  - Test with: curl $WORKER_URL/health"
echo "  - Track document: See docs/API_EXAMPLES.md"
echo "  - View logs: wrangler tail"
