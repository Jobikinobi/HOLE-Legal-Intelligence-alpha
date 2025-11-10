# HOLE Legal Intelligence System (Alpha)

**AI-Powered Legal Document Intelligence - Deployed & Operational** ✅

[![Status](https://img.shields.io/badge/status-deployed-success)](https://legal-intelligence-alpha.joe-1a2.workers.dev/health)
[![License](https://img.shields.io/badge/license-Private-red)](LICENSE)

## Live System

🌐 **Worker URL**: https://legal-intelligence-alpha.joe-1a2.workers.dev  
📊 **Status**: [Check Health](https://legal-intelligence-alpha.joe-1a2.workers.dev/health)  
📂 **GitHub**: https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha

## What This System Does

### Core Capabilities (Currently Working ✅)

1. **Automatic PDF Processing**
   - Upload PDF → Extract structure with Unstructured.io
   - Claude AI extracts legal metadata automatically
   - Store in PostgreSQL + generate embeddings
   - **Processing time**: 3-9 seconds per document

2. **Intelligent Metadata Extraction**
   - Court, county, jurisdiction
   - Case numbers and dates
   - Parties (plaintiff, defendant, etc.)
   - Actors (all people mentioned)
   - Legal concepts (Brady violation, fraud, etc.)
   - Case law citations

3. **Hybrid Search** (95% complete)
   - SQL filtering by metadata (working ✅)
   - Semantic vector search (pending Voyage AI switch)
   - Combined: Most powerful legal search possible

4. **MCP Integration**
   - Model Context Protocol server
   - JSON-RPC 2.0 over HTTP
   - 4 legal intelligence tools
   - Can be used with Claude Desktop or any MCP client

## Quick Start (New Machine)

### One-Command Setup
```bash
# Clone and navigate
git clone https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha.git
cd HOLE-Legal-Intelligence-alpha

# Run verification
./scripts/verify-setup.sh

# If missing prerequisites, install them, then:
./scripts/setup-infrastructure.sh  # Creates Cloudflare resources
./scripts/deploy.sh                # Deploys Worker
./scripts/test-system.sh           # Verifies everything works
```

### Prerequisites

**Required Tools**:
- Node.js 20+
- pnpm
- wrangler (Cloudflare CLI)
- secretspec
- PostgreSQL client
- jq, curl

**Install on macOS**:
```bash
brew install node pnpm jq postgresql@15
npm install -g wrangler
cargo install --git https://github.com/ripatel-fd/secretspec
```

**Required Accounts**:
- Cloudflare (Workers)
- Neon (PostgreSQL)
- Pinecone (Vector DB)
- OpenAI or Voyage AI (Embeddings)
- Anthropic (Claude API)
- Unstructured.io (Document processing)

### Detailed Setup Guide

📖 **See**: [docs/PORTABLE_SETUP.md](docs/PORTABLE_SETUP.md)

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Cloudflare Workers (Edge Network)              │
│  https://legal-intelligence-alpha.workers.dev   │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ MCP Server (JSON-RPC 2.0 over HTTP)      │  │
│  │ - legal_track_document                   │  │
│  │ - legal_search_documents                 │  │
│  │ - legal_analyze_document                 │  │
│  │ - legal_get_document                     │  │
│  └─────────────┬────────────────────────────┘  │
│                │                                │
│    ┌───────────┼───────────────────────┐       │
│    │           │                       │       │
│    ▼           ▼                       ▼       │
│  ┌────┐    ┌─────────┐           ┌────────┐   │
│  │ R2 │    │Hyperdrive│           │   KV   │   │
│  │PDF │    │  (Neon) │           │ Cache  │   │
│  └────┘    └─────────┘           └────────┘   │
└─────────────────┼───────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
  ┌──────────┐       ┌──────────┐
  │   Neon   │       │ Pinecone │
  │PostgreSQL│       │ Vectors  │
  │ 3 schemas│       │1024 dims │
  └──────────┘       └──────────┘
```

## MCP Tools

### 1. `legal_track_document`
Track PDF in database with automatic metadata extraction.

**Input**:
```json
{
  "title": "Motion to Dismiss - Doe v. Smith",
  "filePath": "test/motion.pdf",
  "category": "motion",
  "project": "alt"
}
```

**Output**: Document UUID + extracted metadata

### 2. `legal_search_documents`
Hybrid SQL + vector search.

**Input**:
```json
{
  "query": "emails about protective order coordination",
  "filters": {
    "category": ["email"],
    "actors": ["Maria dos Santos"],
    "dateRange": {"start": "2025-09-01", "end": "2025-09-30"}
  },
  "limit": 10
}
```

**Output**: Ranked search results with metadata

### 3. `legal_analyze_document`
Deep analysis of PDF structure and content.

**Input**:
```json
{
  "filePath": "test/document.pdf",
  "operations": ["extract_metadata", "extract_citations"],
  "deepAnalysis": false
}
```

**Output**: Complete metadata + analysis

### 4. `legal_get_document`
Retrieve full document details by UUID.

**Input**:
```json
{
  "documentId": "uuid-here",
  "project": "alt"
}
```

**Output**: Complete document record

## Project Structure

```
HOLE-Legal-Intelligence-alpha/
├── docs/                              # 📚 All documentation
│   ├── PORTABLE_SETUP.md             # Complete setup guide
│   ├── DEPLOYMENT_CHECKLIST.md       # Step-by-step checklist
│   ├── VOYAGE_AI_SETUP.md            # Embedding model guide
│   └── API_EXAMPLES.md               # Usage examples
├── scripts/                           # 🔧 Automation scripts
│   ├── verify-setup.sh               # Check prerequisites
│   ├── setup-infrastructure.sh       # Create Cloudflare resources
│   ├── deploy.sh                     # Build and deploy
│   └── test-system.sh                # Run tests
├── migrations/                        # 🗄️ Database schema
│   └── 001_multi_tenant_schema.sql   # Initial schema
├── src/                               # 💻 Source code
│   ├── index.ts                      # Main Worker + HTTP transport
│   ├── schemas/                      # MCP tool schemas
│   ├── services/                     # Business logic
│   │   ├── neon.ts                  # PostgreSQL queries
│   │   ├── pinecone.ts              # Vector search
│   │   ├── embeddings.ts            # Embedding generation
│   │   ├── unstructured.ts          # PDF processing
│   │   └── metadata-extractor.ts    # Claude extraction
│   └── tools/                        # MCP tool handlers
├── wrangler.toml                      # Cloudflare config
├── secretspec.toml                    # Secret definitions
├── package.json                       # Dependencies
├── STATUS.md                          # Current system status
└── SESSION_SUMMARY.md                 # Quick reference

```

## Current Status

**System**: 95% Complete ✅  
**Deployed**: https://legal-intelligence-alpha.joe-1a2.workers.dev  
**Last Updated**: Nov 8, 2025

### Working Components
- ✅ Cloudflare Workers (deployed)
- ✅ Neon PostgreSQL (via Hyperdrive)
- ✅ R2 object storage
- ✅ Unstructured.io processing
- ✅ Claude metadata extraction
- ✅ OpenAI embeddings (ada-002)
- ✅ HTTP/JSON-RPC transport
- ✅ Database queries & inserts

### Pending (15 min fix)
- ⚠️ Pinecone indexing (dimension mismatch)
- **Fix**: Switch to Voyage AI Law embeddings
- **Guide**: [docs/VOYAGE_AI_SETUP.md](docs/VOYAGE_AI_SETUP.md)

### Test Results
- 4 documents successfully processed
- All stored in PostgreSQL
- Embeddings generating (261 tokens/doc)
- Metadata extraction working

## Scripts

### Verify Setup
```bash
./scripts/verify-setup.sh
```
Checks all prerequisites and configuration.

### Setup Infrastructure
```bash
./scripts/setup-infrastructure.sh
```
Creates Cloudflare resources (Hyperdrive, R2, KV) automatically.

### Deploy
```bash
./scripts/deploy.sh
```
Builds TypeScript, deploys Worker, runs tests.

### Test System
```bash
./scripts/test-system.sh
```
Runs comprehensive health checks.

## Documentation

| Doc | Purpose |
|-----|---------|
| [STATUS.md](STATUS.md) | Current deployment status |
| [SESSION_SUMMARY.md](SESSION_SUMMARY.md) | Latest session notes |
| [docs/PORTABLE_SETUP.md](docs/PORTABLE_SETUP.md) | Complete setup guide |
| [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) | Step-by-step checklist |
| [docs/VOYAGE_AI_SETUP.md](docs/VOYAGE_AI_SETUP.md) | Embedding model fix |

## Performance

- **Processing**: 3-9 seconds per document
- **Worker Startup**: 57ms
- **Database Queries**: <100ms
- **Bundle Size**: 645 KB compressed

## Contributing

This is a private HOLE Foundation project. For issues or questions, open a GitHub issue.

## License

Private - HOLE Foundation

---

**Quick Links**:
- [Setup Guide](docs/PORTABLE_SETUP.md)
- [Current Status](STATUS.md)
- [API Examples](docs/API_EXAMPLES.md)
- [Troubleshooting](docs/PORTABLE_SETUP.md#troubleshooting)
