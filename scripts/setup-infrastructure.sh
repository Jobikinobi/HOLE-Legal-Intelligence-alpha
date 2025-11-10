#!/bin/bash
#
# Cloudflare Infrastructure Setup Script
# Creates Hyperdrive, R2, and KV resources for Legal Intelligence System
#

set -e

echo "☁️ HOLE Legal Intelligence - Cloudflare Infrastructure Setup"
echo "============================================================"
echo ""

# Check prerequisites
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler not found. Install with: npm install -g wrangler"
    exit 1
fi

if ! command -v secretspec &> /dev/null; then
    echo "❌ secretspec not found. Install from: https://github.com/ripatel-fd/secretspec"
    exit 1
fi

# Check wrangler auth
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Wrangler not authenticated. Running login..."
    wrangler login
fi

echo "📋 This script will create:"
echo "  1. Hyperdrive configuration (Neon PostgreSQL connection)"
echo "  2. R2 bucket for PDF storage"
echo "  3. KV namespace for caching"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "1️⃣ Creating Hyperdrive configuration..."

# Create Hyperdrive
HYPERDRIVE_ID=$(secretspec run -- sh -c 'wrangler hyperdrive create legal-intelligence-neon --connection-string="$NEON_DATABASE_URL" --json' | jq -r '.id')

if [ -z "$HYPERDRIVE_ID" ] || [ "$HYPERDRIVE_ID" = "null" ]; then
    echo "❌ Failed to create Hyperdrive"
    exit 1
fi

echo "✅ Hyperdrive created: $HYPERDRIVE_ID"

echo ""
echo "2️⃣ Creating R2 bucket..."

# Create R2 bucket
if wrangler r2 bucket create legal-documents 2>&1 | grep -q "Created bucket"; then
    echo "✅ R2 bucket created: legal-documents"
elif wrangler r2 bucket create legal-documents 2>&1 | grep -q "already exists"; then
    echo "✅ R2 bucket already exists: legal-documents"
else
    echo "❌ Failed to create R2 bucket"
    exit 1
fi

echo ""
echo "3️⃣ Creating KV namespace..."

# Create KV namespace
KV_OUTPUT=$(wrangler kv namespace create CACHE --json 2>&1)
KV_ID=$(echo "$KV_OUTPUT" | jq -r '.id // empty')

if [ -z "$KV_ID" ]; then
    # Check if already exists
    KV_ID=$(wrangler kv namespace list --json | jq -r '.[] | select(.title == "CACHE") | .id')
    if [ -n "$KV_ID" ]; then
        echo "✅ KV namespace already exists: $KV_ID"
    else
        echo "❌ Failed to create KV namespace"
        exit 1
    fi
else
    echo "✅ KV namespace created: $KV_ID"
fi

echo ""
echo "4️⃣ Updating wrangler.toml..."

# Update wrangler.toml with IDs
cat > wrangler.toml << WRANGLEREOF
name = "legal-intelligence-alpha"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Neon PostgreSQL via Hyperdrive (connection pooling)
[[hyperdrive]]
binding = "NEON"
id = "$HYPERDRIVE_ID"

# R2 bucket for PDF storage
[[r2_buckets]]
binding = "DOCUMENTS_R2"
bucket_name = "legal-documents"

# KV for caching query results
[[kv_namespaces]]
binding = "CACHE_KV"
id = "$KV_ID"

[vars]
PROJECT_DEFAULT = "alt"
UNSTRUCTURED_STRATEGY = "hi_res"

# Secrets (set via: wrangler secret put SECRET_NAME)
# OPENAI_API_KEY or VOYAGE_API_KEY
# ANTHROPIC_API_KEY
# PINECONE_API_KEY
# UNSTRUCTURED_API_KEY
WRANGLEREOF

echo "✅ wrangler.toml updated"

echo ""
echo "5️⃣ Configuring Worker secrets..."

# Set all secrets
for SECRET in OPENAI_API_KEY ANTHROPIC_API_KEY PINECONE_API_KEY UNSTRUCTURED_API_KEY; do
    echo "Setting $SECRET..."
    secretspec run -- sh -c "echo \"\$$SECRET\"" > /tmp/${SECRET}.txt
    cat /tmp/${SECRET}.txt | wrangler secret put $SECRET --name legal-intelligence-alpha
    rm /tmp/${SECRET}.txt
done

echo ""
echo "============================================================"
echo "✅ Infrastructure setup complete!"
echo ""
echo "📝 Resource IDs:"
echo "  Hyperdrive: $HYPERDRIVE_ID"
echo "  R2 Bucket: legal-documents"
echo "  KV Namespace: $KV_ID"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/deploy.sh"
echo "  2. Test: ./scripts/test-system.sh"
