---
DATE: 2025-11-08
AUTHOR: Claude Code AI Assistant
PROJECT: HOLE Legal Intelligence Alpha
PURPOSE: Ultra-quick setup guide for experienced developers
---

# New Machine Quick Start (15 minutes)

## For Experienced Developers

You already have accounts and know the tools. Here's the speed run:

### 1. Clone & Install (2 min)
```bash
git clone https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha.git
cd HOLE-Legal-Intelligence-alpha
pnpm install
```

### 2. Configure Secrets (5 min)
```bash
# Copy secretspec.toml is already in repo
# Just set the secret values:
secretspec set OPENAI_API_KEY "sk-..."
secretspec set ANTHROPIC_API_KEY "sk-ant-..."
secretspec set PINECONE_API_KEY "..."
secretspec set UNSTRUCTURED_API_KEY "..."
secretspec set NEON_DATABASE_URL "postgresql://..."

# Verify
secretspec check  # All should be ✓
```

### 3. Database Migration (2 min)
```bash
secretspec run -- sh -c '/opt/homebrew/opt/postgresql@15/bin/psql "$NEON_DATABASE_URL" -f migrations/001_multi_tenant_schema.sql'
```

### 4. Cloudflare Setup (5 min)
```bash
wrangler login
./scripts/setup-infrastructure.sh
# Creates Hyperdrive, R2, KV, updates wrangler.toml, sets Worker secrets
```

### 5. Deploy & Test (1 min)
```bash
./scripts/deploy.sh
./scripts/test-system.sh
```

## Done!

Your system is now live and operational.

Upload a test PDF:
```bash
wrangler r2 object put legal-documents/test/sample.pdf --file /path/to/file.pdf --remote
```

Track it:
```bash
curl -X POST https://legal-intelligence-alpha.YOUR-ACCOUNT.workers.dev \
  -H "Content-Type: application/json" \
  -d @test_request.json
```

## Verification

✅ `./scripts/verify-setup.sh` - All green  
✅ `./scripts/test-system.sh` - All passed  
✅ Worker responding at your workers.dev URL  
✅ Documents in database  

## If You Move Machines

**Same process** - just:
1. Clone repo
2. Set secrets (same keys, new machine's Keychain)
3. Run setup scripts
4. Deploy

**Your data stays in**:
- Neon PostgreSQL (cloud)
- Pinecone (cloud)
- R2 (cloud)

Only code moves with you!

---

**Total time**: 15 minutes  
**Complexity**: Low - mostly automated  
**Portability**: 100%
