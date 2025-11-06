/**
 * Document Decomposition Service
 *
 * CRITICAL PREPROCESSING STAGE for public records requests.
 *
 * Problem: Government records custodians provide chaotic multi-document PDFs:
 * - Single PDF contains multiple unrelated documents
 * - Mixed document types (reports, emails, photos, memos)
 * - Deliberately disorganized or carelessly bundled
 * - No clear separation or organization
 *
 * Solution:
 * 1. Extract ALL elements with page numbers (Unstructured.io)
 * 2. Use Claude to detect document boundaries
 * 3. Split PDF into discrete documents
 * 4. Then process each normally
 */

import Anthropic from '@anthropic-ai/sdk';
import type { UnstructuredElement } from './metadata-extractor';

export interface DocumentBoundary {
	start_page: number;
	end_page: number;
	document_type: 'police-report' | 'email' | 'sms' | 'photo' | 'memo' | 'court-filing' | 'medical-record' | 'other';
	title: string;
	description: string;
	confidence: number;  // 0-1: How confident is boundary detection?
	case_number?: string;  // If identifiable
	incident_date?: string;  // If identifiable
	subjects?: string[];  // People/topics in this segment
}

export interface DecompositionResult {
	source_file: string;
	total_pages: number;
	boundaries: DocumentBoundary[];
	metadata: {
		processing_time_ms: number;
		unstructured_elements: number;
		claude_analysis_tokens: number;
	};
}

/**
 * Detect document boundaries in a chaotic multi-document PDF
 */
export async function detectDocumentBoundaries(
	elements: UnstructuredElement[],
	anthropicApiKey: string
): Promise<DocumentBoundary[]> {
	const client = new Anthropic({ apiKey: anthropicApiKey });

	// Group elements by page
	const pageGroups = groupElementsByPage(elements);
	const pageCount = Math.max(...Object.keys(pageGroups).map(Number));

	// Create page-by-page summary for Claude
	const pageSummary = Object.entries(pageGroups)
		.sort(([a], [b]) => Number(a) - Number(b))
		.map(([page, els]) => {
			const titles = els.filter(e => e.type === 'Title').map(e => e.text);
			const headers = els.filter(e => e.type === 'Header').map(e => e.text);
			const firstParagraph = els.find(e => e.type === 'NarrativeText')?.text || '';

			return {
				page: Number(page),
				titles,
				headers,
				preview: firstParagraph.slice(0, 200)
			};
		});

	const prompt = `You are analyzing a PDF obtained via public records request from a government records custodian.

**CRITICAL CONTEXT**: Government records custodians often:
- Bundle multiple unrelated documents into single PDFs
- Mix different document types (reports, emails, photos, memos)
- Provide documents without organization or separation
- Sometimes deliberately disorganize to make analysis harder

Your task: Detect document boundaries in this PDF.

**PDF Analysis** (${pageCount} pages):
${JSON.stringify(pageSummary, null, 2)}

**Instructions**:

1. Identify distinct document boundaries based on:
   - Content discontinuity (topic/subject changes abruptly)
   - Document type changes (report → email → photos)
   - Case number changes (different case = different document)
   - Date changes (different incident dates)
   - Header/formatting changes (new document starts)
   - Sender/recipient changes (emails)

2. For each detected document segment, provide:
   - start_page (first page of this document)
   - end_page (last page of this document)
   - document_type (police-report, email, sms, photo, memo, court-filing, medical-record, other)
   - title (descriptive title for this document segment)
   - description (1-2 sentence description of content)
   - confidence (0-1: how confident are you in this boundary?)
   - case_number (if identifiable)
   - incident_date (if identifiable, YYYY-MM-DD format)
   - subjects (people or topics in this segment)

3. Be conservative: If unsure whether to split, favor keeping segments together rather than creating false boundaries.

4. Watch for:
   - Email chains (may span multiple pages but are one document)
   - Multi-page reports (don't split mid-report)
   - Photo collections (group related photos)
   - Embedded attachments (email with attached report = consider as units)

**Return ONLY valid JSON array**:

\`\`\`json
[
  {
    "start_page": 1,
    "end_page": 15,
    "document_type": "police-report",
    "title": "Police Report - Incident 2025-08-21",
    "description": "Investigation report regarding alleged stalking complaint",
    "confidence": 0.95,
    "case_number": "25-12345",
    "incident_date": "2025-08-21",
    "subjects": ["Maria Pacileo", "Stalking complaint"]
  },
  {
    "start_page": 16,
    "end_page": 23,
    "document_type": "email",
    "title": "Email Chain - Maria dos Santos to Shawn Cowie",
    "description": "Email correspondence between complainant and investigating officer",
    "confidence": 0.90,
    "incident_date": "2025-09-05",
    "subjects": ["Maria dos Santos", "Shawn Cowie", "Protective order coordination"]
  }
]
\`\`\``;

	try {
		const message = await client.messages.create({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 8192,  // May need more tokens for large PDFs
			messages: [{
				role: 'user',
				content: prompt
			}]
		});

		const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

		// Extract JSON array
		const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\[[\s\S]*\]/);
		const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;

		const boundaries: DocumentBoundary[] = JSON.parse(jsonText);

		// Validate and sort boundaries
		boundaries.sort((a, b) => a.start_page - b.start_page);

		// Sanity check: No overlapping boundaries
		for (let i = 0; i < boundaries.length - 1; i++) {
			if (boundaries[i].end_page >= boundaries[i + 1].start_page) {
				console.warn(`Overlapping boundaries detected: pages ${boundaries[i].end_page} and ${boundaries[i + 1].start_page}`);
			}
		}

		return boundaries;
	} catch (error) {
		console.error('Document boundary detection failed:', error);

		// Fallback: Treat entire PDF as single document
		return [{
			start_page: 1,
			end_page: pageCount,
			document_type: 'other',
			title: 'Unprocessed Document Bundle',
			description: 'Failed to detect boundaries - treating as single document',
			confidence: 0.1
		}];
	}
}

/**
 * Group Unstructured elements by page number
 */
function groupElementsByPage(elements: UnstructuredElement[]): Record<number, UnstructuredElement[]> {
	const groups: Record<number, UnstructuredElement[]> = {};

	for (const element of elements) {
		const page = element.metadata?.page_number || 1;
		if (!groups[page]) {
			groups[page] = [];
		}
		groups[page].push(element);
	}

	return groups;
}

/**
 * Split PDF into separate files based on detected boundaries
 *
 * Note: This requires a PDF manipulation library (pdf-lib, PyPDF2, etc.)
 * For Cloudflare Workers, we'll need to use external service or edge function
 */
export async function splitPDF(
	pdfBuffer: ArrayBuffer,
	boundaries: DocumentBoundary[],
	outputDir: string
): Promise<Array<{ boundary: DocumentBoundary; filePath: string }>> {
	// TODO: Implement PDF splitting
	// Options:
	// 1. Use pdf-lib (JavaScript, works in Workers)
	// 2. Call external PDF splitting service
	// 3. Use Cloudflare Durable Object with pdf-lib

	// For now, return placeholder
	console.warn('PDF splitting not yet implemented - requires pdf-lib integration');

	return boundaries.map(boundary => ({
		boundary,
		filePath: `${outputDir}/${sanitizeFileName(boundary.title)}_p${boundary.start_page}-${boundary.end_page}.pdf`
	}));
}

/**
 * Sanitize filename for safe filesystem use
 */
function sanitizeFileName(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 100);  // Limit length
}

/**
 * Complete decomposition workflow
 */
export async function decomposeDocument(
	pdfBuffer: ArrayBuffer,
	fileName: string,
	config: {
		unstructuredElements: UnstructuredElement[];
		anthropicApiKey: string;
		outputDir: string;
	}
): Promise<DecompositionResult> {
	const startTime = Date.now();

	// Detect boundaries
	const boundaries = await detectDocumentBoundaries(
		config.unstructuredElements,
		config.anthropicApiKey
	);

	// Split PDF (when implemented)
	// const splitFiles = await splitPDF(pdfBuffer, boundaries, config.outputDir);

	return {
		source_file: fileName,
		total_pages: Math.max(...boundaries.map(b => b.end_page)),
		boundaries,
		metadata: {
			processing_time_ms: Date.now() - startTime,
			unstructured_elements: config.unstructuredElements.length,
			claude_analysis_tokens: 0  // TODO: Track actual token usage
		}
	};
}
