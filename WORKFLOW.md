# Complete Processing Workflow

## For Public Records / FOIA Response PDFs

### The Reality of Your Documents

**Government records custodians provide chaotic PDFs**:
```
elpaso_pd_foia_response_batch3.pdf (87 pages)
├─ Police Report: Stalking complaint (pages 1-18)
├─ Email chain: Maria → Cowie coordination (pages 19-27)
├─ Text message screenshots (pages 28-35)
├─ UNRELATED: Traffic incident report (pages 36-52)
├─ Administrative memo (pages 53-54)
├─ Photo evidence batch (pages 55-70)
└─ ANOTHER UNRELATED: Burglary report (pages 71-87)
```

**Standard processing would**:
- Treat all 87 pages as ONE document ❌
- Generate meaningless embedding (mixed content) ❌
- Extract confused metadata (which case? which court?) ❌
- Search returns entire 87-page PDF (not helpful!) ❌

---

## Complete Processing Pipeline

### Stage 0: Document Decomposition ⭐ USE THIS FIRST

**MCP Tool**: `legal_decompose_document`

**Input**:
```json
{
  "filePath": "/Users/joe/Documents/FOIA/elpaso_pd_batch3.pdf",
  "sourceDescription": "El Paso PD FOIA Response - Batch 3",
  "autoSplit": true,
  "autoTrack": false
}
```

**What Happens**:
1. **Unstructured.io** processes entire PDF
   - Extracts: 450 elements (titles, headers, paragraphs, tables)
   - Each element tagged with page number

2. **Claude API** analyzes element flow
   - Detects topic changes: "Pages 1-18 are about stalking incident"
   - Detects type changes: "Pages 19-27 are emails (different format)"
   - Detects case changes: "Pages 36-52 reference different case number"

3. **Document Boundary Detection**:
   ```json
   [
     {
       "start_page": 1,
       "end_page": 18,
       "document_type": "police-report",
       "title": "Police Report - Stalking Complaint 2025-08-21",
       "case_number": "25-12345",
       "confidence": 0.95,
       "subjects": ["Maria Pacileo", "Stalking"]
     },
     {
       "start_page": 19,
       "end_page": 27,
       "document_type": "email",
       "title": "Email Chain - Maria dos Santos to Shawn Cowie",
       "confidence": 0.92,
       "subjects": ["Maria dos Santos", "Shawn Cowie", "Coordination"]
     },
     ... (5 more segments detected)
   ]
   ```

4. **PDF Splitting** (pdf-lib):
   - Creates 7 separate PDFs
   - Each uploaded to R2 with descriptive names
   - Original preserved as source

**Output**:
```
✓ Decomposed into 7 documents:
  - police-report-stalking-complaint-2025-08-21_p1-18.pdf
  - email-chain-maria-to-cowie_p19-27.pdf
  - sms-screenshots_p28-35.pdf
  - police-report-traffic-incident_p36-52.pdf
  - admin-memo_p53-54.pdf
  - photo-evidence-batch_p55-70.pdf
  - police-report-burglary_p71-87.pdf
```

**Cost**: ~$0.005 per source PDF
**Time**: 30-60 seconds for 50-100 page PDF

---

### Stage 1: Document Tracking (Discrete Documents)

**MCP Tool**: `legal_track_document`

**Now that documents are discrete**, process each one:

```json
{
  "title": "Email Chain - Maria dos Santos Coordination",
  "filePath": "decomposed/elpaso_pd_batch3/email-chain-maria-to-cowie_p19-27.pdf",
  "category": "email",
  "project": "alt"
}
```

**What Happens**:
1. **Unstructured.io** extracts structure from THIS discrete PDF
   - Now content is coherent (only emails, not mixed with reports)

2. **Claude API** extracts metadata
   - Now can accurately identify: "Email from Maria dos Santos to Shawn Cowie on 2025-09-05"
   - Actors: ["Maria dos Santos", "Shawn Cowie"]
   - Legal concepts: ["extrinsic_fraud", "protective_order_coordination"]
   - No confusion from unrelated content!

3. **Neon PostgreSQL** stores metadata
   ```sql
   INSERT INTO project_alt.documents
   (title, category, court, filing_date, ...)
   ```

4. **Pinecone** stores embedding
   - Embedding is CLEAN (only email content, not mixed with reports)

---

### Stage 2: Semantic Search (Hybrid Queries)

**MCP Tool**: `legal_search_documents`

**Now you can query**:
```
Find emails between Maria dos Santos and Shawn Cowie in Sept 2025
mentioning protective order coordination
```

**System executes**:
1. **SQL filters** (Neon):
   ```sql
   SELECT d.id FROM documents d
   JOIN document_actors da1 ON d.id = da1.document_id
   JOIN actors a1 ON da1.actor_id = a1.id AND a1.name = 'Maria dos Santos'
   JOIN document_actors da2 ON d.id = da2.document_id
   JOIN actors a2 ON da2.actor_id = a2.id AND a2.name = 'Shawn Cowie'
   WHERE d.category = 'email'
     AND d.filing_date BETWEEN '2025-09-01' AND '2025-09-30'
   ```
   **Returns**: 8 email document IDs

2. **Vector search** (Pinecone):
   - Generate query embedding: "protective order coordination"
   - Search ONLY within those 8 email IDs
   - **Returns**: Top 3 most relevant emails

3. **Result**: Exact emails you need (Sept 5-7 coordination emails)

**Without decomposition**: Would return entire 87-page PDF ❌

**With decomposition**: Returns specific 9-page email PDF ✅

---

## Workflow Comparison

### ❌ WITHOUT Decomposition (Standard Approach)

```
1. Track chaotic PDF as single document
   └─> 87 pages stored as one document
   └─> Mixed content creates meaningless embedding
   └─> Metadata extraction fails (multiple case numbers confuse Claude)

2. Search for "emails about coordination"
   └─> Returns entire 87-page PDF
   └─> You manually search through to find pages 19-27
   └─> Wastes time, inaccurate results

3. Try to tag with legal concepts
   └─> Confused: Is this extrinsic_fraud? (pages 19-27 yes, pages 1-18 no)
   └─> Tags apply to entire PDF, not specific segments
```

### ✅ WITH Decomposition (This System)

```
1. Decompose chaotic PDF
   └─> Detects 7 discrete documents
   └─> Splits into 7 clean PDFs
   └─> Each with correct type detected

2. Track each discrete document
   └─> Email chain (pages 19-27) tracked separately
   └─> Clean metadata extraction: "Email from Maria to Cowie on 2025-09-05"
   └─> Accurate legal concept tagging: "extrinsic_fraud"

3. Search for "emails about coordination"
   └─> SQL filters: category=email, actors=[Maria, Cowie]
   └─> Vector searches within filtered results
   └─> Returns specific 9-page email PDF
   └─> Includes context: "Pages 19-27 from elpaso_pd_batch3.pdf"
```

---

## Recommended Workflow for Your Case

### For Each FOIA/Public Records Response

**Step 1**: Decompose the chaotic PDF
```
legal_decompose_document(
  filePath: "/path/to/foia_response.pdf",
  autoSplit: true
)
```

**Step 2**: Review detected boundaries
- Claude returns boundary analysis
- Check confidence scores
- Verify document types detected correctly
- Manual review if confidence < 0.80

**Step 3**: Track each split document
```
For each split PDF:
  legal_track_document(
    title: "Auto-generated from decomposition",
    filePath: "decomposed/foia_response/segment_1.pdf",
    category: "police-report"
  )
```

**Step 4**: Query and analyze
```
legal_search_documents(
  query: "protective order coordination",
  filters: { actors: ["Maria dos Santos", "Shawn Cowie"] }
)
```

---

## Handling Edge Cases

### What if Boundary Detection is Wrong?

**Claude detects**: Pages 1-30 = One police report

**Reality**: Pages 1-15 = Report A, Pages 16-30 = Report B

**Solution**: Manual correction tool (coming soon)
```
legal_refine_boundaries(
  sourceDocId: "uuid-from-decomposition",
  correctedBoundaries: [
    { start_page: 1, end_page: 15, ... },
    { start_page: 16, end_page: 30, ... }
  ]
)
```

### What if Documents Should Stay Together?

**Example**: Email with attached police report

**Claude might detect**: Email (pages 1-2), Report (pages 3-10)

**Better**: Keep as one document: "Email with Attached Report"

**Solution**: Boundary detection prompts Claude to consider:
- Is this an attachment relationship?
- Should these stay bundled?

---

## Why This is Essential for Your Case

### Your Documents Are Chaotic by Design

Based on your description:
- ✅ Public records requests (FOIA responses)
- ✅ El Paso PD records custodians
- ✅ "Fought you tooth and nail"
- ✅ Possibly deliberately disorganized
- ✅ Mixed incident reports, emails, civil service files

**Standard document processing would fail completely.**

### What You Get With Decomposition

✅ **Discrete searchable units**: Each email, report, photo batch is separate
✅ **Accurate metadata**: No confusion from mixed content
✅ **Clean embeddings**: Each vector represents coherent content
✅ **Precise search**: Find specific emails, not entire 100-page dump
✅ **Audit trail**: Track which documents came from which source PDF

---

## Implementation Status

- [x] `document-decomposer.ts`: Claude-based boundary detection
- [x] `pdf-splitter.ts`: PDF splitting with pdf-lib
- [x] `decompose-document.ts`: MCP tool implementation
- [ ] Integration with main processing pipeline
- [ ] Testing with sample chaotic PDFs
- [ ] Manual boundary correction tool

---

## Next: Test With Real Document

Once deployed, test with one of your chaotic FOIA response PDFs:

```
Step 1: Decompose
legal_decompose_document("/path/to/elpaso_foia_batch.pdf")

Step 2: Review boundaries
Claude returns analysis showing 5-10 documents detected

Step 3: Track each split document
For each: legal_track_document(...)

Step 4: Search across all
"Find emails from Maria about protective orders"
→ Returns ONLY the relevant email segments, not entire PDF dump
```

**This is the game-changer for your case!**
