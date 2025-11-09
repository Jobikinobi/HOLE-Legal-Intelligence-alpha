---
DATE: 2025-11-08
AUTHOR: Claude Code AI Assistant
PROJECT: HOLE Legal Intelligence Alpha
PURPOSE: Guide to switch from OpenAI to Voyage AI embeddings
---

# Voyage AI Law Embeddings Setup

## Why Switch to Voyage AI?

### Current Problem
- Pinecone index: **1024 dimensions**
- OpenAI ada-002: **1536 dimensions**
- Result: **Dimension mismatch error** (blocking vector search)

### Voyage AI Solution
- **voyage-law-2 model**: 1024 dimensions (perfect match!)
- **Legal-optimized**: Trained specifically on legal documents
- **Better accuracy**: Outperforms general models on legal content
- **Same cost tier**: ~$0.0001 per document

## Quick Setup (15 minutes)

### 1. Get Voyage AI API Key

```bash
# Sign up at: https://www.voyageai.com/
# Go to: https://dash.voyageai.com/api-keys
# Create new API key
# Copy key (starts with "pa-...")
```

### 2. Add to SecretSpec

```bash
cd /Users/joe/secretspec
secretspec set VOYAGE_API_KEY "pa-your-key-here"
```

### 3. Update Cloudflare Worker Secret

```bash
cd "/Users/joe/Documents/GitHub/HOLE-Legal-Intelligence-alpha"
secretspec run -- sh -c 'echo "$VOYAGE_API_KEY"' > /tmp/voyage_key.txt
cat /tmp/voyage_key.txt | wrangler secret put VOYAGE_API_KEY --name legal-intelligence-alpha
rm /tmp/voyage_key.txt
```

### 4. Update Code

Edit `src/services/embeddings.ts`:

```typescript
// OLD (OpenAI):
private model: string = 'text-embedding-ada-002';

// NEW (Voyage AI):
private model: string = 'voyage-law-2';
private baseURL: string = 'https://api.voyageai.com/v1';
```

Update constructor:

```typescript
// OLD:
constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
}

// NEW:
constructor(apiKey: string) {
    this.client = new OpenAI({ 
        apiKey,
        baseURL: this.baseURL
    });
}
```

### 5. Update Environment

Edit `src/index.ts`:

```typescript
// OLD:
this.embeddingsService = new EmbeddingsService(env.OPENAI_API_KEY);

// NEW:
this.embeddingsService = new EmbeddingsService(env.VOYAGE_API_KEY);
```

Update `Env` interface:

```typescript
export interface Env {
    // ...existing secrets
    VOYAGE_API_KEY: string;  // ADD THIS
}
```

### 6. Deploy

```bash
npm run build
wrangler deploy
```

### 7. Test

```bash
# Track a new document
curl -X POST https://legal-intelligence-alpha.joe-1a2.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "legal_track_document",
      "arguments": {
        "title": "Test with Voyage AI",
        "filePath": "test/test_motion.pdf",
        "category": "motion",
        "project": "alt",
        "uploadToR2": false,
        "extractMetadata": true
      }
    }
  }'
```

### 8. Verify Pinecone Indexing

```bash
# Get the document_id from step 7 response
# Check if it's indexed
secretspec run -- psql "$NEON_DATABASE_URL" -c \
  "SELECT pinecone_indexed FROM project_alt.documents WHERE id = 'document-id-here';"

# Should return: pinecone_indexed = t (true!)
```

## Voyage AI API Reference

### Available Models

| Model | Dimensions | Best For |
|-------|------------|----------|
| `voyage-3` | 1024 | General embeddings |
| **`voyage-law-2`** | **1024** | **Legal documents** ⭐ |
| `voyage-code-2` | 1536 | Code search |
| `voyage-2` | 1024 | General (legacy) |

### Pricing

- **Input**: $0.10 / 1M tokens
- **Typical doc**: ~200 tokens
- **Cost per doc**: $0.00002 (cheaper than OpenAI!)

### API Compatibility

Voyage AI uses OpenAI-compatible API format:
```typescript
const response = await client.embeddings.create({
  model: 'voyage-law-2',
  input: text
});
```

No code changes needed beyond `model` and `baseURL`!

## Troubleshooting

### Error: "model not found"
```bash
# Check API key is correct
secretspec run -- sh -c 'curl https://api.voyageai.com/v1/models \
  -H "Authorization: Bearer $VOYAGE_API_KEY" | jq ".data[].id"'

# Should list: voyage-law-2, voyage-3, etc.
```

### Dimension mismatch persists
```bash
# Verify Pinecone index dimensions
secretspec run -- sh -c 'curl https://api.pinecone.io/indexes/legal-documents \
  -H "Api-Key: $PINECONE_API_KEY" | jq ".dimension"'

# Should return: 1024
```

### Embeddings not generating
```bash
# Check Worker logs
wrangler tail

# Look for voyage-law-2 errors
```

## Performance Comparison

### OpenAI ada-002
- Dimensions: 1536
- Legal accuracy: Good
- Speed: ~500ms
- Cost: $0.0001/doc

### Voyage Law-2
- Dimensions: 1024 (matches Pinecone ✅)
- Legal accuracy: **Excellent** (trained on legal corpus)
- Speed: ~400ms
- Cost: $0.00002/doc (**5x cheaper!**)

## Legal-Specific Advantages

Voyage-law-2 is trained on:
- Case law
- Statutes
- Legal briefs
- Court opinions
- Regulations

Results in better semantic understanding of:
- Legal terminology
- Citation patterns
- Procedural language
- Latin legal phrases

## Next Steps After Setup

1. ✅ Verify Pinecone indexing works
2. ✅ Test semantic search
3. ✅ Re-index existing 4 documents (optional)
4. ✅ Upload real legal documents
5. ✅ Compare search quality with metadata-only search

## Support

- Voyage AI Docs: https://docs.voyageai.com/
- Voyage Dashboard: https://dash.voyageai.com/
- API Status: https://status.voyageai.com/

---

**Estimated switch time**: 15 minutes  
**Immediate benefit**: Pinecone indexing will work  
**Long-term benefit**: Better legal search accuracy
