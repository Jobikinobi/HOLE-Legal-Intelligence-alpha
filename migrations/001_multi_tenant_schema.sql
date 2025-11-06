-- =====================================================================
-- HOLE Legal Intelligence System - Multi-Tenant Database Schema
-- =====================================================================
--
-- This schema supports TWO parallel projects:
-- 1. project_azure: Documents processed with Azure Document Intelligence
-- 2. project_alt: Documents processed with Unstructured.io (THIS PROJECT)
--
-- PLUS shared resources (case law, templates) used by both
--
-- =====================================================================

-- =====================================================================
-- SCHEMA 1: SHARED RESOURCES (used by both projects)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS shared;

-- Case law library (shared reference database)
CREATE TABLE shared.case_law (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_name TEXT NOT NULL,
  citation TEXT,
  jurisdiction TEXT,  -- "Texas", "Federal 5th Circuit", etc.
  court TEXT,
  decision_date DATE,
  holding TEXT,
  full_text TEXT,
  summary TEXT,
  pinecone_id TEXT UNIQUE,  -- Vector embedding ID (shared)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_law_name ON shared.case_law(case_name);
CREATE INDEX idx_case_law_jurisdiction ON shared.case_law(jurisdiction);

-- Legal concepts taxonomy (controlled vocabulary)
CREATE TABLE shared.legal_concepts_taxonomy (
  concept_id SERIAL PRIMARY KEY,
  concept TEXT UNIQUE NOT NULL,  -- "extrinsic_fraud", "brady_violation", etc.
  category TEXT,  -- "fraud", "constitutional", "misconduct", "evidence", "procedural"
  description TEXT,
  related_concepts TEXT[],  -- Array of related concept IDs
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with initial legal concepts
INSERT INTO shared.legal_concepts_taxonomy (concept, category, description) VALUES
('extrinsic_fraud', 'fraud', 'Fraud that prevents a party from presenting their case'),
('fraud_in_inducement', 'fraud', 'Fraudulent inducement to enter agreement'),
('fraud_on_court', 'fraud', 'Deception practiced on the court itself'),
('brady_violation', 'constitutional', 'Suppression of exculpatory evidence'),
('due_process', 'constitutional', 'Constitutional due process violation'),
('prosecutorial_misconduct', 'misconduct', 'Improper conduct by prosecutor'),
('police_misconduct', 'misconduct', 'Improper conduct by law enforcement'),
('willful_blindness', 'misconduct', 'Deliberate avoidance of knowledge'),
('chain_of_custody', 'evidence', 'Evidence chain of custody issues'),
('spoliation', 'evidence', 'Destruction or alteration of evidence'),
('falsified_evidence', 'evidence', 'Fabricated or falsified evidence'),
('lack_of_notice', 'procedural', 'Failure to provide proper notice'),
('sealed_proceedings', 'procedural', 'Improper sealing of proceedings'),
('meritorious_defense', 'defense', 'Valid defense on the merits'),
('no_fault', 'defense', 'No-fault requirement for equitable relief');

-- Motion templates (reusable across projects)
CREATE TABLE shared.motion_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  motion_type TEXT,  -- 'dismiss', 'bill-of-review', 'summary-judgment', etc.
  court_type TEXT,  -- 'texas-district', 'texas-county', 'federal', etc.
  template_content TEXT NOT NULL,
  variables JSONB,  -- List of template variables
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document equivalence (same source file processed two ways)
CREATE TABLE shared.document_equivalence (
  azure_doc_id UUID,
  alt_doc_id UUID,
  source_file_path TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  metadata_comparison JSONB,  -- Store quality comparison results
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (azure_doc_id, alt_doc_id)
);

-- =====================================================================
-- SCHEMA 2: PROJECT_AZURE (Azure Document Intelligence approach)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS project_azure;

CREATE TABLE project_azure.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  r2_key TEXT,  -- R2 storage location
  category TEXT CHECK(category IN ('motion', 'case-law', 'evidence', 'email', 'police-report', 'court-order', 'correspondence')),
  content_summary TEXT,
  court TEXT,
  county TEXT,
  jurisdiction TEXT,
  case_number TEXT,
  filing_date DATE,
  processing_method TEXT DEFAULT 'azure_di',
  azure_model_used TEXT,  -- 'prebuilt-layout', 'prebuilt-contract', etc.
  azure_processing_cost NUMERIC(10,4),  -- Track Azure API cost
  processing_quality_score REAL,  -- Manual quality assessment 0-1
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  pinecone_indexed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_azure_docs_category ON project_azure.documents(category);
CREATE INDEX idx_azure_docs_court ON project_azure.documents(court);
CREATE INDEX idx_azure_docs_filing_date ON project_azure.documents(filing_date);

-- Azure extraction results (what Azure DI found)
CREATE TABLE project_azure.extraction_results (
  document_id UUID REFERENCES project_azure.documents(id) ON DELETE CASCADE,
  field_name TEXT,
  field_value TEXT,
  confidence REAL,  -- Azure's confidence score
  PRIMARY KEY (document_id, field_name)
);

-- =====================================================================
-- SCHEMA 3: PROJECT_ALT (Unstructured.io approach - THIS PROJECT)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS project_alt;

CREATE TABLE project_alt.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  r2_key TEXT,  -- R2 storage location
  category TEXT CHECK(category IN ('motion', 'case-law', 'evidence', 'email', 'police-report', 'court-order', 'correspondence')),
  content_summary TEXT,

  -- Court information (extracted via Claude from Unstructured elements)
  court TEXT,
  county TEXT,
  jurisdiction TEXT,
  case_number TEXT,

  -- Dates
  filing_date DATE,
  decision_date DATE,
  event_date DATE,

  -- Processing metadata
  processing_method TEXT DEFAULT 'unstructured',
  parser_used TEXT,  -- 'unstructured-api', 'marker', 'docling'
  processing_time_ms INTEGER,
  processing_quality_score REAL,  -- Manual quality assessment 0-1
  extraction_confidence REAL,  -- Claude's confidence in metadata extraction

  -- Status flags
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  pinecone_indexed BOOLEAN DEFAULT FALSE,
  metadata_verified BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_alt_docs_category ON project_alt.documents(category);
CREATE INDEX idx_alt_docs_court ON project_alt.documents(court);
CREATE INDEX idx_alt_docs_filing_date ON project_alt.documents(filing_date);
CREATE INDEX idx_alt_docs_pinecone_indexed ON project_alt.documents(pinecone_indexed) WHERE NOT pinecone_indexed;

-- Parties (plaintiff, defendant, etc.)
CREATE TABLE project_alt.document_parties (
  document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  party_type TEXT CHECK(party_type IN ('plaintiff', 'defendant', 'petitioner', 'respondent', 'intervenor')),
  party_name TEXT NOT NULL,
  PRIMARY KEY (document_id, party_type, party_name)
);

CREATE INDEX idx_alt_parties_name ON project_alt.document_parties(party_name);

-- Actors (people mentioned in documents)
CREATE TABLE project_alt.actors (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  normalized_name TEXT NOT NULL,  -- "maria dos santos" (lowercase, normalized)
  role TEXT,  -- "police_officer", "attorney", "witness", "judge", etc.
  notes TEXT
);

CREATE INDEX idx_alt_actors_normalized ON project_alt.actors(normalized_name);

-- Document-actor relationships
CREATE TABLE project_alt.document_actors (
  document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES project_alt.actors(id),
  context TEXT,  -- "mentioned as investigating officer", "signed as attorney", etc.
  PRIMARY KEY (document_id, actor_id)
);

-- Legal concepts (tags)
CREATE TABLE project_alt.legal_concepts (
  document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,  -- References shared.legal_concepts_taxonomy.concept
  confidence REAL DEFAULT 1.0,  -- How confident is the extraction?
  source TEXT,  -- "explicit" (stated in doc) or "implicit" (inferred)
  PRIMARY KEY (document_id, concept)
);

CREATE INDEX idx_alt_concepts_concept ON project_alt.legal_concepts(concept);

-- Case citations (which documents cite which case law)
CREATE TABLE project_alt.case_citations (
  id SERIAL PRIMARY KEY,
  source_document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  case_law_id UUID REFERENCES shared.case_law(id),  -- If in case law DB
  case_name TEXT NOT NULL,
  citation TEXT,
  holding TEXT,
  relevance_score REAL,  -- How relevant to source document?
  page_number INTEGER,  -- Where cited in source document
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alt_citations_source ON project_alt.case_citations(source_document_id);
CREATE INDEX idx_alt_citations_case_name ON project_alt.case_citations(case_name);

-- Document relationships (this responds to that, this supports that, etc.)
CREATE TABLE project_alt.document_relationships (
  source_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  target_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  relationship_type TEXT CHECK(relationship_type IN ('cites', 'supports', 'contradicts', 'responds_to', 'amends', 'supersedes')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_id, target_id, relationship_type)
);

-- Unstructured extraction results (raw output from Unstructured.io)
CREATE TABLE project_alt.extraction_results (
  document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  field_name TEXT,
  field_value TEXT,
  extraction_method TEXT,  -- "unstructured", "claude_analysis"
  confidence REAL,
  PRIMARY KEY (document_id, field_name)
);

-- Processing log (audit trail + quality tracking)
CREATE TABLE project_alt.processing_log (
  id SERIAL PRIMARY KEY,
  document_id UUID REFERENCES project_alt.documents(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,  -- 'indexed', 'analyzed', 'updated', 'reprocessed'
  status TEXT CHECK(status IN ('success', 'failed', 'partial')),
  details JSONB,  -- Store processing details, errors, stats
  processing_time_ms INTEGER,
  cost_estimate NUMERIC(10,4),  -- Estimated API costs for this operation
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alt_log_document ON project_alt.processing_log(document_id);
CREATE INDEX idx_alt_log_status ON project_alt.processing_log(status);

-- =====================================================================
-- VIEWS FOR CONVENIENCE
-- =====================================================================

-- Rich document view with all metadata
CREATE VIEW project_alt.documents_enriched AS
SELECT
  d.*,
  json_agg(DISTINCT jsonb_build_object(
    'party_type', dp.party_type,
    'party_name', dp.party_name
  )) FILTER (WHERE dp.party_name IS NOT NULL) as parties,
  json_agg(DISTINCT jsonb_build_object(
    'name', a.name,
    'role', a.role,
    'context', da.context
  )) FILTER (WHERE a.name IS NOT NULL) as actors,
  array_agg(DISTINCT lc.concept) FILTER (WHERE lc.concept IS NOT NULL) as legal_concepts,
  json_agg(DISTINCT jsonb_build_object(
    'case_name', cc.case_name,
    'citation', cc.citation,
    'holding', cc.holding
  )) FILTER (WHERE cc.case_name IS NOT NULL) as case_citations
FROM project_alt.documents d
LEFT JOIN project_alt.document_parties dp ON d.id = dp.document_id
LEFT JOIN project_alt.document_actors da ON d.id = da.document_id
LEFT JOIN project_alt.actors a ON da.actor_id = a.id
LEFT JOIN project_alt.legal_concepts lc ON d.id = lc.document_id
LEFT JOIN project_alt.case_citations cc ON d.id = cc.source_document_id
GROUP BY d.id;

-- =====================================================================
-- GRANTS (if using row-level security)
-- =====================================================================

-- Grant access to schemas
GRANT USAGE ON SCHEMA shared TO PUBLIC;
GRANT USAGE ON SCHEMA project_azure TO PUBLIC;
GRANT USAGE ON SCHEMA project_alt TO PUBLIC;

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shared TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA project_azure TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA project_alt TO PUBLIC;

-- Grant sequence access
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shared TO PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA project_azure TO PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA project_alt TO PUBLIC;
