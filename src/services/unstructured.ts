/**
 * Unstructured.io Document Processing Service
 *
 * Processes legal documents (PDFs, DOCX, images) and extracts:
 * - Structured elements (titles, headers, paragraphs, tables)
 * - Full-text content for embeddings
 * - Document layout and organization
 *
 * This replaces Azure Document Intelligence at 1/15th the cost
 */

import { UnstructuredClient } from 'unstructured-client';
import { Strategy, PartitionResponse } from 'unstructured-client/sdk/models/operations';
import { extractLegalMetadata, type LegalMetadata, type UnstructuredElement } from './metadata-extractor';

export interface ProcessedDocument {
	// Structured elements from Unstructured.io
	elements: UnstructuredElement[];

	// Full-text content (for embeddings)
	fullText: string;

	// Legal metadata (extracted via Claude)
	metadata: LegalMetadata;

	// Processing stats
	stats: {
		total_elements: number;
		processing_time_ms: number;
		unstructured_strategy: string;
		page_count?: number;
	};
}

/**
 * Process a legal document and extract structured data + metadata
 */
export async function processLegalDocument(
	fileBuffer: ArrayBuffer,
	fileName: string,
	config: {
		unstructuredApiKey: string;
		anthropicApiKey: string;
		strategy?: 'hi_res' | 'fast' | 'auto';
	}
): Promise<ProcessedDocument> {
	const startTime = Date.now();

	// Initialize Unstructured client
	const client = new UnstructuredClient({
		serverURL: 'https://api.unstructuredapp.io',
		security: {
			apiKeyAuth: config.unstructuredApiKey
		}
	});

	try {
		// Step 1: Process document with Unstructured.io
		const response = await client.general.partition({
			partitionParameters: {
				files: {
					content: new Uint8Array(fileBuffer),
					fileName: fileName
				},
				strategy: config.strategy || Strategy.HiRes,
				languages: ['eng', 'spa'],  // ⭐ English + Spanish support
				extractImageBlockTypes: ['Image', 'Table'],
				pdfInferTableStructure: true,
				splitPdfConcurrency: 3,
				splitPdfAllowFailed: true
			}
		});

		// Extract elements from response
		const elements: UnstructuredElement[] = (response.elements || []).map((el: any) => ({
			type: el.type || 'Unknown',
			text: el.text || '',
			metadata: el.metadata
		}));

		if (elements.length === 0) {
			throw new Error('Unstructured.io returned no elements');
		}

		// Step 2: Generate full-text content
		const fullText = elements
			.filter(e =>
				e.type === 'Title' ||
				e.type === 'NarrativeText' ||
				e.type === 'ListItem' ||
				e.type === 'Header'
			)
			.map(e => e.text)
			.filter(text => text && text.trim().length > 0)
			.join('\n\n');

		// Step 3: Extract legal metadata using Claude API
		const metadata = await extractLegalMetadata(elements, config.anthropicApiKey);

		// Step 4: Compile processing stats
		const stats = {
			total_elements: elements.length,
			processing_time_ms: Date.now() - startTime,
			unstructured_strategy: config.strategy || 'hi_res',
			page_count: extractPageCount(elements)
		};

		return {
			elements,
			fullText,
			metadata,
			stats
		};
	} catch (error) {
		console.error('Document processing failed:', error);
		throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Extract page count from Unstructured elements
 */
function extractPageCount(elements: UnstructuredElement[]): number | undefined {
	const pageNumbers = elements
		.map(e => e.metadata?.page_number)
		.filter((page): page is number => typeof page === 'number');

	return pageNumbers.length > 0 ? Math.max(...pageNumbers) : undefined;
}

/**
 * Process document from R2 storage
 */
export async function processDocumentFromR2(
	r2Bucket: R2Bucket,
	r2Key: string,
	config: {
		unstructuredApiKey: string;
		anthropicApiKey: string;
		strategy?: 'hi_res' | 'fast' | 'auto';
	}
): Promise<ProcessedDocument> {
	// Fetch document from R2
	const object = await r2Bucket.get(r2Key);

	if (!object) {
		throw new Error(`Document not found in R2: ${r2Key}`);
	}

	const fileBuffer = await object.arrayBuffer();
	const fileName = r2Key.split('/').pop() || 'document.pdf';

	return processLegalDocument(fileBuffer, fileName, config);
}

/**
 * Generate searchable content for vector embeddings
 *
 * Combines metadata + full text for optimal search results
 */
export function generateSearchableContent(processed: ProcessedDocument): string {
	const metadata = processed.metadata;

	// Build structured searchable content
	const parts: string[] = [];

	// Title and type
	parts.push(`Title: ${metadata.title}`);
	parts.push(`Document Type: ${metadata.document_type}`);

	// Court information
	if (metadata.court) parts.push(`Court: ${metadata.court}`);
	if (metadata.county) parts.push(`County: ${metadata.county}`);
	if (metadata.case_number) parts.push(`Case Number: ${metadata.case_number}`);

	// Parties
	if (metadata.parties?.plaintiff) {
		parts.push(`Plaintiff: ${metadata.parties.plaintiff.join(', ')}`);
	}
	if (metadata.parties?.defendant) {
		parts.push(`Defendant: ${metadata.parties.defendant.join(', ')}`);
	}

	// Actors
	if (metadata.actors && metadata.actors.length > 0) {
		parts.push(`Actors: ${metadata.actors.join(', ')}`);
	}

	// Legal concepts
	if (metadata.legal_concepts && metadata.legal_concepts.length > 0) {
		parts.push(`Legal Concepts: ${metadata.legal_concepts.join(', ')}`);
	}

	// Case citations
	if (metadata.case_citations && metadata.case_citations.length > 0) {
		const citations = metadata.case_citations.map(c => c.case_name).join(', ');
		parts.push(`Cited Cases: ${citations}`);
	}

	// Full document text
	parts.push('\n--- Document Content ---\n');
	parts.push(processed.fullText);

	return parts.join('\n');
}
