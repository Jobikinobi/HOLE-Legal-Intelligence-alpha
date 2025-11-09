/**
 * MCP Tool: legal_decompose_document
 *
 * CRITICAL PREPROCESSING for public records request PDFs.
 *
 * Handles chaotic multi-document PDFs from government records custodians:
 * - Detects document boundaries within single PDF
 * - Splits into discrete documents
 * - Each split document then processed normally
 *
 * Use this FIRST before legal_track_document for any public records PDFs!
 */

import { z } from 'zod';
import type { UnstructuredElement } from '../services/metadata-extractor';
import { detectDocumentBoundaries, type DocumentBoundary, type DecompositionResult } from '../services/document-decomposer';
import { splitPDFToR2 } from '../utils/pdf-splitter';

/**
 * Input schema for legal_decompose_document tool
 */
export const DecomposeDocumentSchema = z.object({
	filePath: z.string()
		.min(1)
		.describe('Path to multi-document PDF from public records request'),

	sourceDescription: z.string()
		.optional()
		.describe('Description of source (e.g., "El Paso PD FOIA response batch 3"). Helps Claude understand context.'),

	detectOnly: z.boolean()
		.default(false)
		.describe('RECOMMENDED FIRST STEP: Set true to detect boundaries WITHOUT splitting. Review detected boundaries, then run again with detectOnly=false to split if boundaries look correct.'),

	autoSplit: z.boolean()
		.default(false)
		.describe('Automatically split PDF after detecting boundaries. ONLY set true after reviewing boundaries with detectOnly=true first.'),

	autoTrack: z.boolean()
		.default(false)
		.describe('Automatically track each split document after splitting. WARNING: Processes all split documents immediately (may take time for large batches).'),

	outputPrefix: z.string()
		.optional()
		.describe('R2 prefix for split documents. Default: "decomposed/{source_filename}/"')
}).strict();

export type DecomposeDocumentInput = z.infer<typeof DecomposeDocumentSchema>;

/**
 * Tool description for MCP server
 */
export const DecomposeDocumentTool = {
	name: 'legal_decompose_document',
	description: `**CRITICAL PREPROCESSING TOOL** for public records request PDFs.

**USE THIS FIRST** before tracking any documents from government FOIA/public records responses!

**The Problem**:
Government records custodians often provide chaotic PDFs that bundle multiple unrelated documents:
- Single PDF contains police reports + email chains + photos + memos
- Different document types mixed together
- Multiple incidents/cases in one file
- Deliberately or carelessly disorganized

**What This Tool Does**:
1. Processes entire PDF with Unstructured.io (extracts ALL elements with page numbers)
2. Uses Claude API to detect document boundaries:
   - Identifies where one document ends and another begins
   - Classifies each segment (report, email, sms, photo, memo)
   - Extracts preliminary metadata (case number, dates, subjects)
3. Splits PDF into discrete documents (one per segment)
4. Uploads split PDFs to R2 storage
5. Returns boundary analysis + split file locations

**After decomposition**: Use \`legal_track_document\` on each split PDF (now they're clean, discrete documents)

**Example Input PDF** (50 pages):
- Pages 1-15: Police Report (Incident A)
- Pages 16-23: Email chain
- Pages 24-28: SMS screenshots
- Pages 29-45: Police Report (Unrelated Incident B)
- Pages 46-50: Photos

**Output**: 5 separate PDFs, each with correct document type detected

**Use Cases**:
- FOIA/public records responses
- Discovery productions from opposing counsel
- Police department batch records
- Any PDF where multiple documents are bundled together

**Cost**: ~$0.005 per source PDF (Unstructured + Claude analysis + splitting)

**Processing Time**: ~30-60 seconds for 50-page PDF

**Example**:
\`\`\`json
{
  "filePath": "/Users/joe/Documents/FOIA/elpaso_pd_batch_3.pdf",
  "sourceDescription": "El Paso PD FOIA Response - Batch 3",
  "autoSplit": true,
  "autoTrack": false
}
\`\`\`

**Returns**:
\`\`\`json
{
  "source_file": "elpaso_pd_batch_3.pdf",
  "total_pages": 50,
  "documents_detected": 5,
  "boundaries": [
    {
      "start_page": 1,
      "end_page": 15,
      "document_type": "police-report",
      "title": "Police Report - Stalking Complaint 2025-08-21",
      "confidence": 0.95,
      "split_file": "decomposed/elpaso_pd_batch_3/police-report-stalking-complaint-2025-08-21_p1-15.pdf"
    },
    ...
  ]
}
\`\`\`

**Next Step**: Track each split document with \`legal_track_document\``,

	inputSchema: DecomposeDocumentSchema
};

/**
 * Tool handler implementation
 */
export async function handleDecomposeDocument(
	input: DecomposeDocumentInput,
	env: {
		UNSTRUCTURED_API_KEY: string;
		ANTHROPIC_API_KEY: string;
		DOCUMENTS_R2?: R2Bucket;
	}
) {
	const startTime = Date.now();

	try {
		// 1. Read source PDF
		const fs = await import('fs/promises');
		const pdfBytes = await fs.readFile(input.filePath);

		// 2. Process with Unstructured.io to extract ALL elements
		const { UnstructuredClient } = await import('unstructured-client');
		const { Strategy } = await import('unstructured-client/sdk/models/shared/partitionparameters.js');

		const client = new UnstructuredClient({
			serverURL: 'https://api.unstructuredapp.io',
			security: {
				apiKeyAuth: env.UNSTRUCTURED_API_KEY
			}
		});

		const response = await client.general.partition({
			partitionParameters: {
				files: {
					content: pdfBytes,
					fileName: input.filePath.split('/').pop() || 'document.pdf'
				},
				strategy: Strategy.HiRes,
				extractImageBlockTypes: ['Image', 'Table'],
				pdfInferTableStructure: true,
				languages: ['eng']
			}
		});

		// Extract elements from response
		const rawElements = typeof response === 'string' ? JSON.parse(response) : response;
		const elements = Array.isArray(rawElements) ? rawElements : rawElements.elements || [];

		// 3. Detect document boundaries using Claude
		const boundaries = await detectDocumentBoundaries(
			elements as UnstructuredElement[],
			env.ANTHROPIC_API_KEY
		);

		// 4. Split PDF if requested
		let splitResults: Array<{ boundary: DocumentBoundary; r2Key: string }> = [];

		if (input.autoSplit && env.DOCUMENTS_R2) {
			const sourceFileName = input.filePath.split('/').pop()?.replace('.pdf', '') || 'unknown';
			const r2Prefix = input.outputPrefix || `decomposed/${sourceFileName}/`;

			const { splitPDFToR2 } = await import('../utils/pdf-splitter');
			splitResults = await splitPDFToR2(
				pdfBytes.buffer,
				boundaries,
				env.DOCUMENTS_R2,
				r2Prefix
			);
		}

		// 5. Compile result
		const result: DecompositionResult & { split_files?: typeof splitResults } = {
			source_file: input.filePath,
			total_pages: Math.max(...boundaries.map(b => b.end_page)),
			boundaries,
			metadata: {
				processing_time_ms: Date.now() - startTime,
				unstructured_elements: elements.length,
				claude_analysis_tokens: 0  // TODO: Track from Anthropic API response
			},
			...(input.autoSplit && { split_files: splitResults })
		};

		// 6. Format response
		const responseText = formatDecompositionResult(result, splitResults);

		return {
			content: [{
				type: 'text' as const,
				text: responseText
			}]
		};
	} catch (error) {
		return {
			content: [{
				type: 'text' as const,
				text: `Decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			}],
			isError: true
		};
	}
}

/**
 * Format decomposition results as markdown
 */
function formatDecompositionResult(
	result: DecompositionResult,
	splitFiles?: Array<{ boundary: DocumentBoundary; r2Key: string }>
): string {
	let markdown = `# Document Decomposition Results\n\n`;
	markdown += `**Source File**: ${result.source_file}\n`;
	markdown += `**Total Pages**: ${result.total_pages}\n`;
	markdown += `**Documents Detected**: ${result.boundaries.length}\n`;
	markdown += `**Processing Time**: ${(result.metadata.processing_time_ms / 1000).toFixed(1)}s\n\n`;
	markdown += `---\n\n`;

	markdown += `## Detected Document Boundaries\n\n`;

	for (let i = 0; i < result.boundaries.length; i++) {
		const boundary = result.boundaries[i];
		const splitFile = splitFiles?.[i];

		markdown += `### ${i + 1}. ${boundary.title}\n\n`;
		markdown += `- **Pages**: ${boundary.start_page}-${boundary.end_page} (${boundary.end_page - boundary.start_page + 1} pages)\n`;
		markdown += `- **Document Type**: ${boundary.document_type}\n`;
		markdown += `- **Description**: ${boundary.description}\n`;
		markdown += `- **Confidence**: ${(boundary.confidence * 100).toFixed(0)}%\n`;

		if (boundary.case_number) markdown += `- **Case Number**: ${boundary.case_number}\n`;
		if (boundary.incident_date) markdown += `- **Incident Date**: ${boundary.incident_date}\n`;
		if (boundary.subjects && boundary.subjects.length > 0) {
			markdown += `- **Subjects**: ${boundary.subjects.join(', ')}\n`;
		}

		if (splitFile) {
			markdown += `- **Split File**: \`${splitFile.r2Key}\`\n`;
		}

		markdown += `\n`;
	}

	if (splitFiles && splitFiles.length > 0) {
		markdown += `---\n\n`;
		markdown += `## Next Steps\n\n`;
		markdown += `Split documents are ready for tracking. For each document above, run:\n\n`;
		markdown += `\`\`\`\nUse legal_track_document with the split file R2 key\n\`\`\`\n`;
	} else {
		markdown += `---\n\n`;
		markdown += `## Next Steps\n\n`;
		markdown += `Boundaries detected. To split the PDF, run this tool again with \`autoSplit: true\`.\n`;
	}

	return markdown;
}

/**
 * Sanitize filename
 */
function sanitizeFileName(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, 200);
}
