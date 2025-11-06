# Setup Guide - HOLE Legal Intelligence System

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] pnpm installed
- [ ] Wrangler CLI installed (`pnpm add -g wrangler`)
- [ ] SecretSpec installed and configured
- [ ] Neon PostgreSQL account
- [ ] Pinecone account (you have this)
- [ ] OpenAI API key
- [ ] Anthropic API key
- [ ] Unstructured.io API key (you have this)
- [ ] Cloudflare account

---

## Step 1: Configure Secrets (SecretSpec)

All API keys managed via your SecretSpec system (macOS Keychain).

```bash
cd /Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha

# Check what secrets are needed
secretspec check

# Add secrets interactively (SecretSpec prompts for each)
secretspec set NEON_DATABASE_URL
secretspec set PINECONE_API_KEY
secretspec set OPENAI_API_KEY
secretspec set ANTHROPIC_API_KEY
secretspec set UNSTRUCTURED_API_KEY
secretspec set CLOUDFLARE_ACCOUNT_ID
secretspec set CLOUDFLARE_API_TOKEN

# Verify all configured
secretspec check  # Should show ✓ for all
```

### Getting Your API Keys

**Neon Database URL**:
1. Go to https://console.neon.tech
2. Create project: "legal-intelligence-alpha"
3. Copy connection string: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb`

**Pinecone** (you already have):
- Dashboard → API Keys → Copy your key
- Note your environment (e.g., `us-east-1-aws`)

**OpenAI**:
- https://platform.openai.com/api-keys
- Create new key → Copy

**Anthropic**:
- https://console.anthropic.com/settings/keys
- Create key → Copy

**Unstructured.io** (you already have):
- Should already be in your SecretSpec

**Cloudflare**:
- Dashboard → My Profile → API Tokens
- Create token with Workers edit permissions
- Copy Account ID from dashboard

---

## Step 2: Install Dependencies

```bash
cd /Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha

# Install all dependencies
pnpm install
```

---

## Step 3: Set Up Neon Database

### Create Database and Run Migrations

```bash
# Load NEON_DATABASE_URL from SecretSpec
export NEON_DATABASE_URL=$(secretspec get NEON_DATABASE_URL)

# Run migrations to create schemas
psql $NEON_DATABASE_URL -f migrations/001_multi_tenant_schema.sql

# Verify schemas created
psql $NEON_DATABASE_URL -c "\dn"
# Should show: shared, project_azure, project_alt
```

### Verify Schema Creation

```bash
# List tables in project_alt schema
psql $NEON_DATABASE_URL -c "\dt project_alt.*"

# Should show:
# - documents
# - document_parties
# - actors
# - document_actors
# - legal_concepts
# - case_citations
# - document_relationships
# - extraction_results
# - processing_log
```

---

## Step 4: Set Up Pinecone Index

### Create Index (if not exists)

```bash
# Via Pinecone console or CLI
# Index name: legal-documents
# Dimensions: 1536 (for OpenAI text-embedding-3-small)
# Metric: cosine
# Cloud: AWS (us-east-1)
```

**Or via Python/Node**:
```bash
# Quick script to create index
node -e "
const { Pinecone } = require('@pinecone-database/pinecone');
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
pc.createIndex({
  name: 'legal-documents',
  dimension: 1536,
  metric: 'cosine',
  spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
});
"
```

---

## Step 5: Configure Cloudflare

### Login to Cloudflare

```bash
wrangler login
# Opens browser for authentication
```

### Create Hyperdrive (Neon Connection Pooling)

```bash
# Get Neon URL from SecretSpec
export NEON_URL=$(secretspec get NEON_DATABASE_URL)

# Create Hyperdrive config
wrangler hyperdrive create legal-neon --connection-string="$NEON_URL"

# Output will show:
# Created Hyperdrive legal-neon
# ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Copy the ID and update wrangler.toml:
# [[hyperdrive]]
# binding = "NEON"
# id = "paste-id-here"
```

### Create R2 Bucket

```bash
wrangler r2 bucket create legal-documents

# Output:
# Created bucket legal-documents
```

### Create KV Namespace

```bash
wrangler kv namespace create CACHE_KV

# Output:
# Created KV namespace
# ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Copy ID and update wrangler.toml:
# [[kv_namespaces]]
# binding = "CACHE_KV"
# id = "paste-id-here"
```

### Set Secrets in Cloudflare

```bash
# Use SecretSpec to pull from Keychain and set in Cloudflare
secretspec run -- wrangler secret put NEON_DATABASE_URL
secretspec run -- wrangler secret put PINECONE_API_KEY
secretspec run -- wrangler secret put OPENAI_API_KEY
secretspec run -- wrangler secret put ANTHROPIC_API_KEY
secretspec run -- wrangler secret put UNSTRUCTURED_API_KEY

# Verify secrets set
wrangler secret list
```

---

## Step 6: Local Development Testing

### Run Local Dev Server

```bash
cd /Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha

# Run with SecretSpec (loads secrets from Keychain)
secretspec run -- pnpm run dev

# Server will start on http://localhost:8787
```

### Test MCP Server

```bash
# In another terminal, use MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:8787

# Or test with stdio transport (for Claude Desktop)
node dist/index.js
```

---

## Step 7: Deploy to Cloudflare

### Build and Deploy

```bash
cd /Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha

# Build TypeScript
pnpm run build

# Deploy to Cloudflare Workers
secretspec run -- pnpm run deploy

# Output will show:
# Deployed to: https://legal-intelligence-alpha.your-subdomain.workers.dev
```

### Verify Deployment

```bash
# Test health endpoint
curl https://legal-intelligence-alpha.your-subdomain.workers.dev

# Should return:
# {
#   "service": "HOLE Legal Intelligence Alpha",
#   "status": "online",
#   "version": "1.0.0"
# }
```

---

## Step 8: Configure Claude Desktop

### Add MCP Server to Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "legal-intelligence": {
      "command": "node",
      "args": [
        "/Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha/dist/index.js"
      ],
      "env": {
        "NEON_DATABASE_URL": "from-secretspec",
        "PINECONE_API_KEY": "from-secretspec",
        "OPENAI_API_KEY": "from-secretspec",
        "ANTHROPIC_API_KEY": "from-secretspec",
        "UNSTRUCTURED_API_KEY": "from-secretspec"
      }
    }
  }
}
```

**Or use remote deployment**:
```json
{
  "mcpServers": {
    "legal-intelligence-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://legal-intelligence-alpha.your-subdomain.workers.dev"
      ]
    }
  }
}
```

### Restart Claude Desktop

```bash
# Restart Claude Desktop to load new MCP server
killall "Claude"
open -a "Claude"
```

---

## Step 9: First Document Test

### Track Your First Document

In Claude Desktop:

```
Track this document: /path/to/sample-motion.pdf
Title: "Motion to Dismiss - Smith v. Jones"
Category: motion
```

Claude will use the `legal_track_document` tool:
1. Uploads to R2
2. Processes with Unstructured.io
3. Extracts metadata with Claude API
4. Stores in Neon (queryable!)
5. Generates embedding → Pinecone
6. Returns document UUID

### Search for the Document

```
Search for motions mentioning "failure to state a claim"
```

Claude will use `legal_search_documents` tool:
1. SQL filters by category='motion'
2. Vector search for semantic similarity
3. Returns your document with relevance score

---

## Troubleshooting

### Secret Not Found

```bash
# Verify SecretSpec can access Keychain
secretspec list

# Re-add specific secret
secretspec set SECRET_NAME
```

### Database Connection Failed

```bash
# Test Neon connection directly
psql $NEON_DATABASE_URL -c "SELECT NOW();"

# If fails, check connection string format:
# postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname
```

### Wrangler Build Fails

```bash
# Check TypeScript compilation
pnpm run build

# If errors, check src/ files for type issues
```

### Unstructured.io API Fails

```bash
# Verify API key
secretspec get UNSTRUCTURED_API_KEY

# Test API directly
curl -X POST https://api.unstructuredapp.io/general/v0/general \
  -H "unstructured-api-key: YOUR_KEY" \
  -F "files=@test.pdf"
```

---

## Next Steps

After successful setup:

1. **Import case law**: Add Alexander v Hegadorn, Baker v Goldsmith to `shared.case_law`
2. **Create motion templates**: Add bill of review, motion to dismiss templates
3. **Batch import documents**: Process your existing 1,000-2,000 documents
4. **Test search queries**: Validate hybrid search (SQL + vector)
5. **Test motion drafting**: Generate AI-assisted draft

---

## Support

For issues:
- Check logs: `wrangler tail`
- Review Neon dashboard: https://console.neon.tech
- Review Pinecone dashboard: https://app.pinecone.io
- Check SecretSpec: `secretspec check`
