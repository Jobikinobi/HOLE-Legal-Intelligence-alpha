/**
 * Legal Document Metadata Extraction Service
 *
 * This service solves the critical problem: raw OCR text lacks structure.
 *
 * Pipeline:
 * 1. Unstructured.io extracts document structure (titles, headers, paragraphs, tables)
 * 2. Claude API extracts legal metadata from structured elements
 * 3. Returns queryable metadata for PostgreSQL storage
 *
 * Without this: You can only full-text search (like Azure-only approach)
 * With this: You can filter by court, actors, legal concepts, dates, etc.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface UnstructuredElement {
	type: string;  // "Title", "Header", "NarrativeText", "Table", etc.
	text: string;
	metadata?: {
		page_number?: number;
		coordinates?: unknown;
	};
}

export interface LegalMetadata {
	// Core document metadata
	title: string;
	document_type: 'motion' | 'case-law' | 'evidence' | 'email' | 'police-report' | 'court-order' | 'correspondence';

	// Court information
	court?: string;           // "65th District Court"
	county?: string;          // "El Paso County"
	jurisdiction?: string;    // "Texas"
	case_number?: string;     // "CV-2025-12345"

	// Parties
	parties?: {
		plaintiff?: string[];
		defendant?: string[];
		petitioner?: string[];
		respondent?: string[];
	};

	// Actors mentioned
	actors?: string[];        // ["Maria dos Santos", "Shawn Cowie", ...]

	// Dates
	filing_date?: string;     // ISO format: "2025-01-15"
	decision_date?: string;
	event_date?: string;

	// Legal analysis
	legal_concepts?: string[];   // ["extrinsic_fraud", "brady_violation", ...]
	case_citations?: Array<{
		case_name: string;
		citation?: string;
		holding?: string;
	}>;

	// Evidence classification
	evidence_type?: string;      // "email", "video", "photograph", "testimony"
	evidence_strength?: 'critical' | 'strong' | 'supporting' | 'contextual';

	// Privilege
	privileged?: boolean;
	privilege_type?: string;     // "attorney-client", "work-product"

	// Confidence scores
	extraction_confidence?: number;  // 0-1
}

/**
 * Extract legal metadata from Unstructured.io structured elements using Claude API
 */
export async function extractLegalMetadata(
	elements: UnstructuredElement[],
	anthropicApiKey: string
): Promise<LegalMetadata> {
	const client = new Anthropic({ apiKey: anthropicApiKey });

	// Prepare structured content for Claude
	const titles = elements.filter(e => e.type === 'Title').map(e => e.text);
	const headers = elements.filter(e => e.type === 'Header').map(e => e.text);
	const firstParagraphs = elements
		.filter(e => e.type === 'NarrativeText')
		.slice(0, 10)
		.map(e => e.text);

	// Build extraction prompt
	const prompt = `You are a legal document metadata extraction expert. Analyze this document structure and extract comprehensive legal metadata.

**Document Structure:**

**Titles:**
${titles.join('\n')}

**Headers:**
${headers.join('\n')}

**First 10 Paragraphs:**
${firstParagraphs.join('\n\n')}

**Extract the following metadata:**

1. **Document Identification:**
   - title (full document title)
   - document_type (motion | case-law | evidence | email | police-report | court-order | correspondence)

2. **Court Information:**
   - court (e.g., "65th District Court")
   - county (e.g., "El Paso County")
   - jurisdiction (e.g., "Texas", "Federal")
   - case_number (e.g., "CV-2025-12345")

3. **Parties:**
   - plaintiff (array of names)
   - defendant (array of names)
   - petitioner (array if applicable)
   - respondent (array if applicable)

4. **Actors/Individuals Mentioned:**
   - actors (array of all people mentioned: officers, attorneys, witnesses, etc.)

5. **Dates:**
   - filing_date (ISO format: YYYY-MM-DD)
   - decision_date (if applicable)
   - event_date (if document describes specific event)

6. **Legal Concepts:**
   - legal_concepts (array of concepts like: "extrinsic_fraud", "brady_violation", "due_process", "willful_blindness", "prosecutorial_misconduct", "chain_of_custody", etc.)

7. **Case Citations:**
   - case_citations (array of objects with case_name, citation, holding)

8. **Evidence Classification (if applicable):**
   - evidence_type ("email", "video", "photograph", "testimony", etc.)
   - evidence_strength ("critical" | "strong" | "supporting" | "contextual")

9. **Privilege:**
   - privileged (boolean)
   - privilege_type ("attorney-client", "work-product", etc.)

**Return ONLY valid JSON in this exact format:**

\`\`\`json
{
  "title": "...",
  "document_type": "...",
  "court": "...",
  "county": "...",
  "jurisdiction": "...",
  "case_number": "...",
  "parties": {
    "plaintiff": ["..."],
    "defendant": ["..."]
  },
  "actors": ["..."],
  "filing_date": "YYYY-MM-DD",
  "legal_concepts": ["..."],
  "case_citations": [
    {
      "case_name": "...",
      "citation": "...",
      "holding": "..."
    }
  ],
  "evidence_type": "...",
  "privileged": false,
  "extraction_confidence": 0.95
}
\`\`\`

**Important:**
- Use null for fields you cannot determine with confidence
- Normalize actor names consistently (e.g., "Maria dos Santos" not "Maria" or "dos Santos")
- Include extraction_confidence (0-1) based on clarity of source material
- Be precise with legal concept tags - only include if explicitly mentioned or clearly implied`;

	try {
		const message = await client.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			messages: [{
				role: 'user',
				content: prompt
			}]
		});

		// Parse Claude's JSON response
		const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

		// Extract JSON from response (may be wrapped in markdown code blocks)
		const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/{[\s\S]*}/);
		const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;

		const metadata: LegalMetadata = JSON.parse(jsonText);

		return metadata;
	} catch (error) {
		console.error('Metadata extraction failed:', error);

		// Return minimal metadata on failure
		return {
			title: titles[0] || 'Unknown Document',
			document_type: 'correspondence',  // Default fallback
			extraction_confidence: 0.1,
			legal_concepts: []
		};
	}
}

/**
 * Enhance metadata with additional analysis (optional deep dive)
 */
export async function enhanceMetadata(
	baseMetadata: LegalMetadata,
	fullText: string,
	anthropicApiKey: string
): Promise<LegalMetadata> {
	const client = new Anthropic({ apiKey: anthropicApiKey });

	// For critical documents, do deeper analysis
	const enhancementPrompt = `You previously extracted this metadata:
${JSON.stringify(baseMetadata, null, 2)}

Now analyze the full document text and enhance the metadata with:
1. Additional actors you might have missed
2. Implicit legal concepts (concepts implied but not stated)
3. Document relationships (does this respond to another document? cite another?)
4. Strategic importance (why is this document significant?)

Full document text (first 5000 chars):
${fullText.slice(0, 5000)}

Return enhanced metadata JSON with same structure, plus:
- implicit_concepts (array of implied legal concepts)
- document_purpose (1-2 sentence summary of what this document accomplishes)
- strategic_value ("high" | "medium" | "low")`;

	try {
		const message = await client.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 2048,
			messages: [{ role: 'user', content: enhancementPrompt }]
		});

		const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
		const jsonMatch = responseText.match(/{[\s\S]*}/);
		const enhanced = jsonMatch ? JSON.parse(jsonMatch[0]) : baseMetadata;

		return { ...baseMetadata, ...enhanced };
	} catch (error) {
		console.error('Metadata enhancement failed:', error);
		return baseMetadata;  // Return base metadata if enhancement fails
	}
}
