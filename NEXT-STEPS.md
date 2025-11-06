# Next Steps - HOLE Legal Intelligence System

## What's Been Built (✅ Complete)

✅ **Project structure** created with Cloudflare Workers
✅ **All service clients** implemented:
   - Unstructured.io (document processing)
   - Claude API (metadata extraction)
   - OpenAI (embeddings)
   - Neon PostgreSQL (metadata storage)
   - Pinecone (vector search)
✅ **Automatic metadata extraction** (solves your Azure problem!)
✅ **Multi-tenant database schema** (Azure vs Alt projects)
✅ **MCP tools** defined (track, search, analyze, get document)
✅ **SecretSpec integration** (Keychain secret management)
✅ **Zod validation schemas** (following Anthropic best practices)

---

## Immediate Next Steps (Do These Now)

### 1. Configure Your Secrets (10 minutes)

```bash
cd /Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha

# Check what's needed
secretspec check

# Add each secret (you have most of these already)
secretspec set NEON_DATABASE_URL
# Paste your Neon connection string

secretspec set UNSTRUCTURED_API_KEY
# You mentioned you have this ready

# Verify
secretspec check
```

### 2. Create Neon Database (5 minutes)

```bash
# Option A: Via Neon Console
# 1. Go to https://console.neon.tech
# 2. Create new project: "legal-intelligence-alpha"
# 3. Copy connection string to SecretSpec

# Option B: Via CLI (if you have it)
neon projects create --name legal-intelligence-alpha
```

### 3. Run Database Migrations (2 minutes)

```bash
# This creates the multi-tenant schema
export NEON_DATABASE_URL=$(secretspec get NEON_DATABASE_URL)
pnpm run db:migrate

# Or manually:
psql $NEON_DATABASE_URL -f migrations/001_multi_tenant_schema.sql

# Verify:
psql $NEON_DATABASE_URL -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('shared', 'project_azure', 'project_alt');"
```

### 4. Set Up Pinecone Index (5 minutes)

You already have Pinecone account. Create index:

```bash
# Via Pinecone console: https://app.pinecone.io
# - Click "Create Index"
# - Name: legal-documents
# - Dimensions: 1536
# - Metric: cosine
# - Cloud: AWS
# - Region: us-east-1

# Or via script:
node -e "
const pc = new (require('@pinecone-database/pinecone')).Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});
pc.createIndex({
  name: 'legal-documents',
  dimension: 1536,
  metric: 'cosine',
  spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
});
"
```

### 5. Configure Cloudflare Resources (10 minutes)

```bash
# Login to Cloudflare
wrangler login

# Create Hyperdrive (Neon connection pooling)
export NEON_URL=$(secretspec get NEON_DATABASE_URL)
wrangler hyperdrive create legal-neon --connection-string="$NEON_URL"

# Copy the Hyperdrive ID from output
# Update wrangler.toml - uncomment and paste ID:
# [[hyperdrive]]
# binding = "NEON"
# id = "paste-hyperdrive-id-here"

# Create R2 bucket
wrangler r2 bucket create legal-documents

# Create KV namespace
wrangler kv namespace create CACHE_KV
# Copy namespace ID to wrangler.toml

# Set secrets in Cloudflare
secretspec run -- wrangler secret put NEON_DATABASE_URL
secretspec run -- wrangler secret put PINECONE_API_KEY
secretspec run -- wrangler secret put OPENAI_API_KEY
secretspec run -- wrangler secret put ANTHROPIC_API_KEY
secretspec run -- wrangler secret put UNSTRUCTURED_API_KEY
```

---

## Then: Development & Testing (Optional Before Deploy)

### Local Development

```bash
# Run local server
secretspec run -- pnpm run dev

# Server runs on http://localhost:8787
```

### Test with Sample Document

Create a test script:

```bash
# test-track-document.sh
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "legal_track_document",
      "arguments": {
        "title": "Test Motion",
        "filePath": "/path/to/test.pdf",
        "category": "motion",
        "project": "alt"
      }
    }
  }'
```

---

## Finally: Deploy to Production (5 minutes)

```bash
# Build and deploy
secretspec run -- pnpm run deploy

# Output shows your Worker URL:
# https://legal-intelligence-alpha.your-subdomain.workers.dev
```

---

## What You Can Do Once Deployed

### In Claude Desktop

**Track a document**:
```
Please track this document:
Title: "Motion to Dismiss - My Case"
File: /Users/joe/Documents/case-files/motion.pdf
Category: motion
```

**Search documents**:
```
Find all emails between Maria dos Santos and Shawn Cowie in
September 2025 that mention coordination or protective orders
```

**Analyze a document**:
```
Analyze this PDF and extract all metadata:
/Users/joe/Documents/evidence/email-sept-5.pdf
```

**Draft a motion**:
```
Draft an equitable bill of review for 65th District Court
showing extrinsic fraud in the inducement. Use Alexander v
Hegadorn as primary authority. Include these evidence documents:
[UUID-1, UUID-2, UUID-3]
```

---

## Estimated Time to Complete Setup

- Configure secrets: **10 minutes**
- Set up Neon database: **7 minutes**
- Set up Pinecone: **5 minutes**
- Configure Cloudflare: **10 minutes**
- Deploy: **5 minutes**

**Total: ~40 minutes to production**

---

## Critical Success Factors

### ✅ Metadata Extraction Working

The key innovation: Every document automatically gets:
- Court, county, jurisdiction
- Actors extracted and normalized
- Legal concepts tagged
- Case citations identified
- Dates parsed

**Test**: After tracking your first document, query Neon:
```sql
SELECT title, court, array_agg(concept) as concepts
FROM project_alt.documents d
LEFT JOIN project_alt.legal_concepts lc ON d.id = lc.document_id
WHERE d.category = 'motion'
GROUP BY d.id, d.title, d.court;
```

Should show extracted metadata (not just full text like Azure!).

### ✅ Hybrid Search Working

**Test**: Search for document by:
1. Exact filter (court = "65th District Court")
2. Semantic query ("extrinsic fraud arguments")

Both should work together.

---

## Questions?

Stuck? Check:
1. `secretspec check` - All secrets configured?
2. `psql $NEON_DATABASE_URL -c "\dn"` - Schemas exist?
3. `wrangler secret list` - Cloudflare secrets set?
4. `wrangler tail` - View live logs

Ready to deploy? Run through steps 1-7 above!
