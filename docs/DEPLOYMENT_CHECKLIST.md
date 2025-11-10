---
DATE: 2025-11-08
AUTHOR: Claude Code AI Assistant
PROJECT: HOLE Legal Intelligence Alpha
PURPOSE: Deployment checklist for new machines and updates
---

# Deployment Checklist

## New Machine Setup

### Prerequisites (15 minutes)

- [ ] Install Node.js 20+ (`brew install node`)
- [ ] Install pnpm (`npm install -g pnpm`)
- [ ] Install wrangler (`npm install -g wrangler`)
- [ ] Install secretspec (cargo or binary)
- [ ] Install PostgreSQL client (`brew install postgresql@15`)
- [ ] Install jq (`brew install jq`)
- [ ] Verify: Run `./scripts/verify-setup.sh`

### Accounts & Access (5 minutes)

- [ ] Cloudflare account with Workers enabled
- [ ] OpenAI API key (or Voyage AI)
- [ ] Anthropic API key
- [ ] Pinecone account with index
- [ ] Unstructured.io API key
- [ ] Neon PostgreSQL database
- [ ] GitHub access to repository

### Repository Setup (5 minutes)

- [ ] Clone: `git clone https://github.com/Jobikinobi/HOLE-Legal-Intelligence-alpha.git`
- [ ] Navigate: `cd HOLE-Legal-Intelligence-alpha`
- [ ] Install deps: `pnpm install`
- [ ] Test build: `pnpm run build`

### Secret Configuration (10 minutes)

- [ ] Set OPENAI_API_KEY: `secretspec set OPENAI_API_KEY "sk-..."`
- [ ] Set ANTHROPIC_API_KEY: `secretspec set ANTHROPIC_API_KEY "sk-ant-..."`
- [ ] Set PINECONE_API_KEY: `secretspec set PINECONE_API_KEY "..."`
- [ ] Set UNSTRUCTURED_API_KEY: `secretspec set UNSTRUCTURED_API_KEY "..."`
- [ ] Set NEON_DATABASE_URL: `secretspec set NEON_DATABASE_URL "postgresql://..."`
- [ ] Optional: Set VOYAGE_API_KEY: `secretspec set VOYAGE_API_KEY "pa-..."`
- [ ] Verify: `secretspec check` (all green checkmarks)

### Database Setup (5 minutes)

- [ ] Verify connection: `secretspec run -- psql "$NEON_DATABASE_URL" -c "SELECT version();"`
- [ ] Run migrations: `secretspec run -- psql "$NEON_DATABASE_URL" -f migrations/001_multi_tenant_schema.sql`
- [ ] Verify schemas: `secretspec run -- psql "$NEON_DATABASE_URL" -c "\dn"`
- [ ] Should show: `shared`, `project_alt`, `project_azure`

### Cloudflare Infrastructure (10 minutes)

- [ ] Authenticate: `wrangler login`
- [ ] Run setup: `./scripts/setup-infrastructure.sh`
- [ ] Creates: Hyperdrive, R2 bucket, KV namespace
- [ ] Updates: wrangler.toml with resource IDs
- [ ] Sets: All Worker secrets

### Deployment (5 minutes)

- [ ] Deploy: `./scripts/deploy.sh`
- [ ] Verify: Health check passes
- [ ] Verify: MCP initialization works
- [ ] Note: Worker URL (e.g., https://legal-intelligence-alpha.your-account.workers.dev)

### Testing (10 minutes)

- [ ] Run: `./scripts/test-system.sh`
- [ ] Upload test PDF: `wrangler r2 object put legal-documents/test/sample.pdf --file /path/to/file.pdf --remote`
- [ ] Track document via MCP tools/call
- [ ] Verify in database: Check `project_alt.documents`
- [ ] Check embeddings: Look for `embedding_tokens > 0` in `processing_log`

---

## Update Deployment (Already Set Up)

### Code Changes

- [ ] Pull latest: `git pull origin main`
- [ ] Install deps: `pnpm install` (if package.json changed)
- [ ] Build: `pnpm run build`
- [ ] Deploy: `./scripts/deploy.sh`
- [ ] Test: `./scripts/test-system.sh`

### Configuration Changes

- [ ] Update `wrangler.toml` if needed
- [ ] Redeploy: `wrangler deploy`

### Secret Updates

- [ ] Update in SecretSpec: `secretspec set SECRET_NAME "new-value"`
- [ ] Update in Worker: `secretspec run -- sh -c 'echo "$SECRET_NAME"' | wrangler secret put SECRET_NAME --name legal-intelligence-alpha`
- [ ] Redeploy: `wrangler deploy`

### Database Migrations

- [ ] Create new migration: `migrations/002_your_migration.sql`
- [ ] Test locally first: `secretspec run -- psql "$NEON_DATABASE_URL" -f migrations/002_your_migration.sql`
- [ ] Commit migration file
- [ ] Deploy code changes

---

## Verification Commands

### Check System Health
```bash
curl https://legal-intelligence-alpha.joe-1a2.workers.dev/health
```

### Check Database
```bash
secretspec run -- psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM project_alt.documents;"
```

### Check Worker Logs
```bash
wrangler tail
```

### Check Secrets
```bash
secretspec check
wrangler secret list
```

### Check Resources
```bash
wrangler r2 bucket list
wrangler kv namespace list
wrangler hyperdrive list
```

---

## Common Issues

### Issue: "secretspec: command not found"
**Fix**: Install secretspec (see Prerequisites)

### Issue: "Cannot connect to database"
**Fix**: Verify NEON_DATABASE_URL is correct, check Neon project is active

### Issue: "Wrangler not authenticated"
**Fix**: Run `wrangler login`

### Issue: "Dimension mismatch" error
**Fix**: Ensure Pinecone dimensions match embedding model (see docs/VOYAGE_AI_SETUP.md)

### Issue: "Worker deployment failed"
**Fix**: Check `wrangler whoami`, verify account has Workers enabled

---

## Success Criteria

✅ All items in checklist complete  
✅ `./scripts/verify-setup.sh` passes  
✅ `./scripts/test-system.sh` passes  
✅ Health endpoint returns `{"status": "online"}`  
✅ Can track and retrieve documents  
✅ Database queries working  

---

**Total Setup Time**: ~60 minutes for first-time setup  
**Update Time**: ~5 minutes for code changes  
**Portability**: 100% - works on any machine with prerequisites
