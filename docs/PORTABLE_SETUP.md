---
DATE: 2025-11-08
AUTHOR: Claude Code AI Assistant  
PROJECT: HOLE Legal Intelligence Alpha
PURPOSE: Complete portable setup guide for any machine
---

# Portable Setup Guide

This guide allows you to set up the HOLE Legal Intelligence System on ANY machine with a clean, reproducible process.

## Prerequisites

### Required Software

| Tool | Install Command | Purpose |
|------|----------------|---------|
| **Node.js 20+** | `brew install node` | Runtime |
| **pnpm 10+** | `npm install -g pnpm` | Package manager |
| **Wrangler** | `npm install -g wrangler` | Cloudflare CLI |
| **SecretSpec** | See below | Secret management |
| **PostgreSQL Client** | `brew install postgresql@15` | Database access |
| **jq** | `brew install jq` | JSON parsing |
| **curl** | (pre-installed) | HTTP requests |

### Install SecretSpec

```bash
# Install from GitHub
cargo install --git https://github.com/ripatel-fd/secretspec

# Or download binary from releases
# https://github.com/ripatel-fd/secretspec/releases

# Verify installation
secretspec --version
```

## Step-by-Step Setup (New Machine)

### 1. Clone Repository

```bash
# Clone from GitHub
git clone https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha.git
cd HOLE-Legal-Intelligence-alpha

# Or use SSH
git clone git@github.com:Jobikinobi/HOLE-Legal-Intelligence-alpha.git
cd HOLE-Legal-Intelligence-alpha
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Verify installation
pnpm run build
```

### 3. Configure Secrets

Create `secretspec.toml` with your API keys:

```toml
[project]
name = "HOLE-Legal-Intelligence-alpha"
revision = "1.0"

[profiles.default]
OPENAI_API_KEY = "keyring:OPENAI_API_KEY"
ANTHROPIC_API_KEY = "keyring:ANTHROPIC_API_KEY"
PINECONE_API_KEY = "keyring:PINECONE_API_KEY"
UNSTRUCTURED_API_KEY = "keyring:UNSTRUCTURED_API_KEY"
NEON_DATABASE_URL = "keyring:NEON_DATABASE_URL"
VOYAGE_API_KEY = "keyring:VOYAGE_API_KEY"  # Optional: for Voyage AI embeddings
```

Set each secret:

```bash
secretspec set OPENAI_API_KEY "sk-your-key"
secretspec set ANTHROPIC_API_KEY "sk-ant-your-key"
secretspec set PINECONE_API_KEY "your-pinecone-key"
secretspec set UNSTRUCTURED_API_KEY "your-unstructured-key"
secretspec set NEON_DATABASE_URL "postgresql://user:pass@host/db?sslmode=require"

# Optional: For Voyage AI embeddings (recommended)
secretspec set VOYAGE_API_KEY "pa-your-voyage-key"
```

Verify secrets:

```bash
secretspec check
```

### 4. Set Up Neon Database

#### Option A: Use Existing Database

If you already have a Neon database:
```bash
# Get connection string from Neon console
# Add to SecretSpec (done in step 3)
```

#### Option B: Create New Database

```bash
# 1. Go to: https://console.neon.tech
# 2. Create new project: "legal-intelligence-alpha"
# 3. Copy the connection string
# 4. Add to SecretSpec:
secretspec set NEON_DATABASE_URL "postgresql://..."
```

Run migrations:

```bash
secretspec run -- psql "$NEON_DATABASE_URL" -f migrations/001_multi_tenant_schema.sql
```

Verify:

```bash
secretspec run -- psql "$NEON_DATABASE_URL" -c "\dn"
# Should show: shared, project_alt, project_azure schemas
```

### 5. Set Up Pinecone Index

#### Check Existing Index

```bash
secretspec run -- sh -c 'curl https://api.pinecone.io/indexes \
  -H "Api-Key: $PINECONE_API_KEY" | jq ".indexes[] | {name, dimension}"'
```

#### Create Index (if needed)

```bash
# Go to: https://app.pinecone.io
# Create new index:
#   Name: legal-documents
#   Dimensions: 1024 (for Voyage AI) or 1536 (for OpenAI)
#   Metric: cosine
#   Cloud: serverless
```

**Important**: Match dimensions to your embedding model!
- Voyage AI Law: 1024 dimensions
- OpenAI ada-002: 1536 dimensions

### 6. Set Up Cloudflare Resources

```bash
# Run automated setup
./scripts/setup-infrastructure.sh
```

This creates:
- Hyperdrive configuration
- R2 bucket
- KV namespace
- Updates wrangler.toml with IDs
- Sets all Worker secrets

### 7. Verify Setup

```bash
# Run verification script
./scripts/verify-setup.sh
```

Should show all green checkmarks ✅

### 8. Deploy

```bash
# Build and deploy
./scripts/deploy.sh
```

### 9. Test End-to-End

Upload a test PDF:

```bash
# Create test directory in R2
wrangler r2 object put legal-documents/test/sample.pdf --file /path/to/your/sample.pdf --remote
```

Track the document:

```bash
curl -X POST https://legal-intelligence-alpha.joe-1a2.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "legal_track_document",
      "arguments": {
        "title": "Test Document",
        "filePath": "test/sample.pdf",
        "category": "motion",
        "project": "alt",
        "uploadToR2": false,
        "extractMetadata": true
      }
    }
  }' | jq '.result'
```

## Configuration Files Explained

### `secretspec.toml`
- **Purpose**: Defines which secrets are needed
- **Storage**: Actual values in macOS Keychain (secure)
- **Portable**: Just copy the .toml file, set secrets on new machine

### `wrangler.toml`
- **Purpose**: Cloudflare Worker configuration
- **Contains**: Resource IDs (Hyperdrive, R2, KV)
- **Portable**: Resource IDs may differ per account

### `package.json`
- **Purpose**: Node.js dependencies
- **Portable**: Run `pnpm install` on any machine

### `migrations/`
- **Purpose**: Database schema
- **Portable**: Run migrations on any Neon instance

## Moving to a New Machine

### Quick Checklist

1. ✅ Clone repository
2. ✅ Install prerequisites (Node, pnpm, wrangler, secretspec)
3. ✅ Run `pnpm install`
4. ✅ Create `secretspec.toml` and set secrets
5. ✅ Run `./scripts/setup-infrastructure.sh` (creates new resources)
6. ✅ Run `./scripts/verify-setup.sh`
7. ✅ Run `./scripts/deploy.sh`
8. ✅ Test with `./scripts/test-system.sh`

### Time Estimate

- **First-time setup**: 30-45 minutes
- **With existing accounts**: 15-20 minutes
- **Subsequent deployments**: 2-3 minutes

## Troubleshooting

### "secretspec: command not found"
```bash
cargo install --git https://github.com/ripatel-fd/secretspec
```

### "wrangler not authenticated"
```bash
wrangler login
# Opens browser for OAuth
```

### "Cannot connect to database"
```bash
# Verify connection string
secretspec run -- psql "$NEON_DATABASE_URL" -c "SELECT version();"

# Check Neon project is active at https://console.neon.tech
```

### "Dimension mismatch" error
```bash
# Check Pinecone index dimensions
secretspec run -- sh -c 'curl https://api.pinecone.io/indexes/legal-documents \
  -H "Api-Key: $PINECONE_API_KEY" | jq ".dimension"'

# Must match your embedding model:
# - 1024 for Voyage AI Law
# - 1536 for OpenAI ada-002
```

### Scripts not executable
```bash
chmod +x scripts/*.sh
```

## What Gets Committed to Git

✅ **Committed** (portable):
- Source code (`src/`)
- Configuration templates (`wrangler.toml`, `secretspec.toml`)
- Database migrations (`migrations/`)
- Documentation (`docs/`, `README.md`)
- Scripts (`scripts/`)

❌ **Not Committed** (gitignored):
- Secrets (in Keychain via SecretSpec)
- Dependencies (`node_modules/`)
- Build artifacts (`*.js`, `.wrangler/`)
- Test files (`test/`)

## Architecture Benefits

### Modularity
- **Services**: Each in `src/services/` - swap implementations easily
- **Tools**: Each MCP tool is isolated
- **Config**: All in files, nothing hardcoded

### Portability
- **Secrets**: SecretSpec manages cross-machine
- **Infrastructure**: Scripts recreate resources
- **Database**: Migrations are version controlled

### Maintainability
- **TypeScript**: Type safety
- **Tests**: Automated via scripts
- **Docs**: All in `docs/` folder

## Support

- **GitHub Issues**: https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha/issues
- **Status Check**: `curl https://legal-intelligence-alpha.joe-1a2.workers.dev/health`
- **Logs**: `wrangler tail`

---

**Setup time**: 15-45 minutes depending on experience  
**Portability**: Full - works on any Unix/macOS machine  
**Maintenance**: Automated via scripts
