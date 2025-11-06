# When to Use Document Decomposition

## The Only Question That Matters

```
Does this PDF contain multiple separate documents bundled together,
or is it a single coherent document (even if multi-page)?

├─> MULTIPLE documents bundled (mixed types, different cases, different dates)
│   └─> USE DECOMPOSITION
│       Example: PDF with police report + emails + SMS + unrelated incident
│
└─> SINGLE coherent document (even if 100 pages)
    └─> SKIP decomposition, use legal_track_document directly
        Example: 100-page deposition transcript (one conversation)
```

## Simple Test: Skim First 10 Pages

**Look for indicators of MULTIPLE bundled documents**:

✅ **USE Decomposition** if you see:
- Page 1: Police report header
- Page 15: **Sudden change** to email format/headers
- Page 25: **Different case number** appears
- Page 30: **SMS screenshot** format
- Page 40: **Completely different incident/date**

✅ **SKIP Decomposition** if you see:
- Continuous narrative (same topic throughout)
- Single document type (all one police report, all one email thread)
- Chronological flow (one story from start to finish)
- Same case/incident throughout

---

## Decision Tree (Revised)

```
New PDF to process
│
└─> Quick skim (first 10 pages):
    │
    ├─> Do you see SUDDEN CHANGES in:
    │   - Document type (report → email → photos)?
    │   - Case number (CV-12345 → CV-67890)?
    │   - Incident date (Aug 21 → Sept 15 → Oct 3)?
    │   - Topic (stalking complaint → traffic stop)?
    │   - Format (typed text → SMS screenshot → photo)?
    │
    ├─> YES (sudden changes) → MULTIPLE DOCUMENTS BUNDLED
    │   └─> USE: legal_decompose_document
    │       └─> Let Claude detect boundaries and split
    │
    └─> NO (continuous, coherent) → SINGLE DOCUMENT
        └─> SKIP decomposition
        └─> USE: legal_track_document directly
```

---

## Clear Indicators to USE Decomposition

### ✅ Definitely Use Decomposition If:

1. **Source is public records dump**
   - FOIA/PIR responses
   - Police department batch records
   - Discovery productions from government agencies
   - Civil service files (multiple officers' records bundled)

2. **PDF shows obvious mixed content** (skim first few pages):
   - Page 1 is police report header
   - Page 15 suddenly shows email headers
   - Page 20 shows SMS screenshot format
   - Different case numbers on different pages

3. **Large page count from government source**
   - 50+ pages from records custodian
   - "Batch" or "Dump" in filename
   - Multiple dates/incidents mentioned

4. **Known problematic sources**:
   - El Paso PD records (you mentioned they're chaotic)
   - Records custodians who "fought tooth and nail"
   - Sources that seem deliberately disorganized

### ✅ Recommended Workflow for Suspicious PDFs

**Two-step process** (safe approach):

```bash
# Step 1: Detect boundaries only (no splitting)
legal_decompose_document(
  filePath: "/path/to/suspicious.pdf",
  detectOnly: true,
  autoSplit: false
)

# Claude returns boundary analysis:
# - 5 documents detected
# - Confidence scores: 0.95, 0.92, 0.88, 0.91, 0.85
# - Boundaries look correct?

# Step 2: If boundaries look good, split
legal_decompose_document(
  filePath: "/path/to/suspicious.pdf",
  detectOnly: false,
  autoSplit: true
)
```

---

## Clear Indicators to SKIP Decomposition

### ❌ Don't Use Decomposition If:

1. **Source is clean legal document**:
   - Motion filed by attorney
   - Court order from clerk
   - Case law opinion
   - Legal brief
   - Contract or agreement

2. **Single coherent document** (even if multi-page):
   - 50-page police report (but all ONE report)
   - Long email thread (but all ONE conversation)
   - Multi-page deposition transcript

3. **Already manually separated files**:
   - Your organized case files
   - Documents you've already reviewed
   - Attorney work product

4. **Known clean sources**:
   - Court clerks
   - Professional legal services
   - Your own attorney's filings

---

## Example Scenarios

### Scenario 1: El Paso PD FOIA Response

**File**: `elpaso_pd_response_batch3.pdf` (87 pages)
**Source**: Records custodian, FOIA request
**Description**: "Mixed records dump"

**Decision**: ✅ **USE DECOMPOSITION**
**Reason**: Government source + large batch + likely mixed content

**Workflow**:
```
1. legal_decompose_document(detectOnly: true)
2. Review: 7 documents detected
3. legal_decompose_document(autoSplit: true)
4. Track each of 7 split documents
```

### Scenario 2: Your Attorney's Motion

**File**: `motion_to_dismiss_draft3.pdf` (25 pages)
**Source**: Your attorney
**Description**: "Motion to Dismiss - Draft 3"

**Decision**: ❌ **SKIP DECOMPOSITION**
**Reason**: Clean legal document, single coherent motion

**Workflow**:
```
legal_track_document(
  title: "Motion to Dismiss - Draft 3",
  category: "motion"
)
```

### Scenario 3: Court Order

**File**: `court_order_protective_order.pdf` (3 pages)
**Source**: 65th District Court Clerk
**Description**: "Protective Order - Final"

**Decision**: ❌ **SKIP DECOMPOSITION**
**Reason**: Court documents are discrete and clean

**Workflow**:
```
legal_track_document(
  title: "Protective Order - Final",
  category: "court-order"
)
```

### Scenario 4: Discovery Production

**File**: `plaintiff_discovery_production_001.pdf` (150 pages)
**Source**: Opposing counsel's discovery production
**Description**: "Documents responsive to Request for Production No. 1"

**Decision**: ⚠️ **PROBABLY USE DECOMPOSITION**
**Reason**: Discovery productions often bundle multiple documents

**Workflow**:
```
1. Skim first 10 pages: Mixed content? (emails, reports, contracts?)
2. If YES: legal_decompose_document(detectOnly: true)
3. Review boundaries
4. If boundaries make sense: Split and track
5. If NO mixed content: Skip decomposition
```

### Scenario 5: 20 Civil Service Files

**File**: `civil_service_file_officer_smith.pdf` (40 pages)
**Source**: El Paso PD personnel records
**Description**: "Officer John Smith - Complete Personnel File"

**Decision**: ⚠️ **CHECK FIRST**
**Reason**: Personnel files might be:
- One coherent file (chronological personnel history) → Skip decomposition
- OR multiple documents bundled (applications, complaints, commendations) → Use decomposition

**Workflow**:
```
1. Quick skim: Is this chronological narrative or bundled documents?
2. If bundled: legal_decompose_document(detectOnly: true)
3. If coherent: legal_track_document (skip decomposition)
```

---

## Quick Reference

### Use Decomposition For:
✅ FOIA/PIR responses
✅ Police records dumps
✅ Discovery productions (multi-doc)
✅ Batch records from custodians
✅ Any PDF you suspect has mixed content

### Skip Decomposition For:
❌ Attorney-drafted documents
❌ Court filings/orders
❌ Case law opinions
❌ Your organized files
❌ Single-topic documents (even if multi-page)

### When Unsure:
1. Run with `detectOnly: true` first
2. Review boundary analysis
3. If boundaries detected = 1 (entire PDF) → Skip decomposition, track normally
4. If boundaries > 1 with high confidence → Split and track

---

## Rule of Thumb

**"If it came from a government records custodian, decompose it first."**

**"If it's a clean legal document, track it directly."**
