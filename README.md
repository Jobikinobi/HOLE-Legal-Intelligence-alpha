# HOLE Legal Intelligence System (Alpha)

**AI-Powered Legal Document Tracking + Vector Search + Motion Drafting**

## Overview

This system provides comprehensive legal document intelligence with:
- **Automatic metadata extraction** from PDFs using Unstructured.io + Claude API
- **Hybrid search** (structured SQL queries + semantic vector search)
- **Multi-tenant architecture** (supports parallel Azure vs Unstructured testing)
- **AI-assisted motion drafting** with templates
- **Cloudflare Workers deployment** (unlimited timeout, global edge)

## The Problems This Solves

### Problem 1: Azure DI Doesn't Extract Queryable Metadata

**Azure Document Intelligence alone** extracts text but doesn't structure it as queryable metadata.

**Impact**: Can only full-text search. Can't filter by court, actors, legal concepts.

### Problem 2: Government Records Are Chaotic Multi-Document PDFs ⚠️ CRITICAL

**Reality of public records requests**:
- Single PDF contains MULTIPLE unrelated documents
- Mixed types: Police reports + emails + SMS + photos all in one file
- Different incidents/cases bundled together
- Deliberately or carelessly disorganized

**Example**: `elpaso_pd_response.pdf` (50 pages) contains:
- Pages 1-15: Police Report (Incident A)
- Pages 16-23: Email chain
- Pages 24-28: SMS screenshots
- Pages 29-45: Unrelated incident report (Incident B)
- Pages 46-50: Photos

**Standard systems assume**: 1 PDF = 1 document (WRONG!)

**This system handles chaotic PDFs** with document decomposition preprocessing.

---

## Architecture

### Stage 0: Document Decomposition (PUBLIC RECORDS PDFs) ⭐ NEW

```
Chaotic Multi-Document PDF (government FOIA response)
   │
   ├─> Unstructured.io (extract ALL elements with page numbers)
   │
   ├─> Claude API (detect document boundaries)
   │   └─> Identifies: Pages 1-15 = Police Report, Pages 16-23 = Email Chain, etc.
   │
   └─> PDF Splitting (pdf-lib)
       └─> Creates discrete PDFs: report.pdf, email.pdf, sms.pdf, etc.
```

### Stage 1-3: Standard Processing (Discrete Documents)

```
Discrete PDF Document
   │
   ├─> Unstructured.io (extracts structure)
   │   └─> Elements: [Title, Header, NarrativeText, Table...]
   │
   ├─> Claude API (extracts legal metadata from structure)
   │   └─> Metadata: {court, actors, legal_concepts, citations...}
   │
   ├─> Neon PostgreSQL (stores metadata - queryable!)
   │   └─> Filter: WHERE court = '65th District' AND actor = 'dos Santos'
   │
   └─> Pinecone (stores embeddings)
       └─> Semantic search within filtered results
```

---

## Prerequisites

### Required Accounts
- [x] Neon PostgreSQL account (free tier sufficient)
- [x] Pinecone account (you have paid plan)
- [x] OpenAI API key (embeddings)
- [x] Anthropic API key (metadata extraction, drafting)
- [x] Unstructured.io API key (you have this ready)
- [x] Cloudflare account (Workers deployment)

### Required Tools
- Node.js 18+
- pnpm (package manager)
- SecretSpec (your macOS Keychain secret manager)
- Wrangler CLI (Cloudflare)

---

## Quick Start

### 1. Configure Secrets (SecretSpec)

All API keys are managed via SecretSpec (macOS Keychain integration):

```bash
# Check which secrets are needed
secretspec check

# Add secrets (interactive - prompts for each)
secretspec set NEON_DATABASE_URL
secretspec set PINECONE_API_KEY
secretspec set OPENAI_API_KEY
secretspec set ANTHROPIC_API_KEY
secretspec set UNSTRUCTURED_API_KEY
secretspec set CLOUDFLARE_ACCOUNT_ID
secretspec set CLOUDFLARE_API_TOKEN

# Or add non-interactively
secretspec set NEON_DATABASE_URL --value "postgresql://user:pass@host/db"

# Verify all secrets configured
secretspec check  # Should show ✓ for all required secrets
```

**Secrets are stored in macOS Keychain** - never in `.env` files!

### 2. Set Up Neon Database

```bash
# Create database (via Neon console or API)
# Name: legal-intelligence-alpha

# Run migrations
psql $NEON_DATABASE_URL < migrations/001_multi_tenant_schema.sql
```

This creates:
- `shared` schema (case law, templates, concepts)
- `project_azure` schema (Azure DI processed docs)
- `project_alt` schema (Unstructured.io processed docs - THIS PROJECT)

### 3. Set Up Pinecone Index

```bash
# Create index (via Pinecone console or API)
# Name: legal-documents
# Dimensions: 1536 (OpenAI text-embedding-3-small)
# Metric: cosine
# Pod type: p1 or serverless
```

### 4. Configure Cloudflare

```bash
# Install Wrangler
pnpm add -g wrangler

# Login to Cloudflare
wrangler login

# Set up Hyperdrive (Neon connection pooling)
wrangler hyperdrive create legal-neon --connection-string="$NEON_DATABASE_URL"
# Copy Hyperdrive ID to wrangler.toml

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

### 5. Develop Locally

```bash
# Install dependencies
pnpm install

# Run local development server
secretspec run -- pnpm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:8787
```

### 6. Deploy to Cloudflare

```bash
# Build and deploy
secretspec run -- pnpm run deploy

# Your MCP server URL:
# https://legal-intelligence-alpha.your-subdomain.workers.dev
```

---

## MCP Tools

### `legal_track_document`

Add document to tracking database with automatic metadata extraction.

**Example**:
```typescript
{
  "title": "Motion to Dismiss - Smith v. Jones",
  "filePath": "/path/to/motion.pdf",
  "category": "motion",
  "project": "alt"  // Use Unstructured.io processing
}
```

**What happens**:
1. Uploads PDF to R2
2. Processes with Unstructured.io → Structured elements
3. Extracts metadata with Claude → Court, actors, legal concepts, citations
4. Stores in Neon PostgreSQL → Queryable metadata
5. Generates embedding → Stores in Pinecone
6. Returns document UUID

### `legal_search_documents`

Hybrid search: SQL filtering + vector similarity.

**Example**:
```typescript
{
  "query": "emails showing coordination between Maria dos Santos and police",
  "filters": {
    "category": ["email"],
    "actors": ["Maria dos Santos", "Shawn Cowie"],
    "dateRange": { "start": "2025-09-05", "end": "2025-09-07" }
  },
  "limit": 10
}
```

**What happens**:
1. Neon SQL filters by actors + category + date
2. Pinecone searches only those filtered document vectors
3. Returns top matches with metadata + snippets

### `legal_analyze_document`

Deep AI analysis of legal document.

**Example**:
```typescript
{
  "filePath": "/path/to/document.pdf",
  "operations": ["extract_metadata", "classify_document", "extract_citations"]
}
```

**Returns**: Structured metadata JSON

### `legal_draft_motion`

AI-assisted motion generation with templates.

**Example**:
```typescript
{
  "motionType": "bill-of-review",
  "court": "65th District Court, El Paso County",
  "facts": "Agreed to protective order under fraudulent inducement...",
  "legalBasis": "Extrinsic fraud per Alexander v Hegadorn...",
  "caseReferences": ["Alexander v Hegadorn"],
  "evidenceDocIds": ["uuid-1", "uuid-2"]  // Emails showing coordination
}
```

**Returns**: Formatted motion with citations and exhibit list

---

## Key Features

### Automatic Metadata Extraction ⭐

**The innovation**: Every document automatically gets:
- Court, county, jurisdiction extracted
- Parties (plaintiff, defendant) identified
- Actors (all people mentioned) cataloged
- Legal concepts tagged
- Case citations extracted
- Dates parsed

**No manual tagging required!**

### Hybrid Search

**SQL handles**:
- Exact filters (court, date, category)
- Actor relationships (emails BETWEEN X AND Y)
- Legal concept tags
- Document relationships

**Pinecone handles**:
- Semantic similarity (conceptual search)
- "Find similar to this document"
- Search within filtered results

**Together**: Most powerful legal document search possible

### Multi-Tenant Testing

- `project_azure`: Your existing Azure DI approach
- `project_alt`: This Unstructured.io approach
- `shared`: Case law library used by both

**Compare**: Which approach extracts better metadata? Use `legal_compare_approaches` tool.

---

## Cost Breakdown

### One-Time (1,500 documents)
- Unstructured.io API: $1.50 (vs Azure $22.50)
- OpenAI embeddings: $1.50
- Neon storage: $0 (free tier)
- Pinecone: Included in your plan
- **Total: $3** (vs Azure $22.50)

### Monthly Ongoing
- Unstructured: ~$0.50/month (new docs)
- OpenAI: ~$0.50/month
- Neon: $0
- Pinecone: Your existing plan
- Cloudflare: $0 (free tier covers this)
- **Total: ~$1/month**

**Savings: 93% vs Azure approach**

---

## Development Status

- [x] Project structure created
- [x] Dependencies installed
- [x] Metadata extraction service (Unstructured + Claude)
- [x] Database schema (multi-tenant)
- [x] SecretSpec configuration
- [ ] Neon service client
- [ ] Pinecone service client
- [ ] MCP server implementation
- [ ] Core MCP tools
- [ ] Cloudflare deployment

---

## Next Steps

1. Run `secretspec check` to verify all keys configured
2. Create Neon database and run migrations
3. Continue building MCP tools
4. Test locally
5. Deploy to Cloudflare

---

## License

Private - HOLE Foundation
