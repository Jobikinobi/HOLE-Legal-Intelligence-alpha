/**
 * Zod Validation Schemas for Legal Document MCP Tools
 *
 * Following Anthropic MCP best practices:
 * - Comprehensive descriptions
 * - Strict validation with constraints
 * - Clear examples in descriptions
 */

import { z } from 'zod';

/**
 * Document categories
 */
export const DocumentCategory = z.enum([
	'motion',
	'case-law',
	'evidence',
	'email',
	'police-report',
	'court-order',
	'correspondence'
]).describe('Document category/type');

/**
 * Project identifier (multi-tenant support)
 */
export const ProjectSchema = z.enum(['azure', 'alt'])
	.default('alt')
	.describe('Project identifier: "azure" for Azure DI approach, "alt" for Unstructured.io approach');

/**
 * Legal concept tags (controlled vocabulary)
 */
export const LegalConcepts = z.array(z.string()).describe(
	'Legal concepts present in document. Examples: "extrinsic_fraud", "brady_violation", "due_process", "prosecutorial_misconduct"'
);

/**
 * Date range filter
 */
export const DateRangeSchema = z.object({
	start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date (YYYY-MM-DD format)'),
	end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date (YYYY-MM-DD format)')
}).describe('Date range filter for filing/decision dates');

/**
 * Tool 1: legal_track_document - Input Schema
 */
export const TrackDocumentSchema = z.object({
	project: ProjectSchema,

	title: z.string()
		.min(1)
		.max(500)
		.describe('Document title. Example: "Motion to Dismiss - Smith v. Jones"'),

	filePath: z.string()
		.min(1)
		.describe('Absolute path to PDF file on local filesystem. Example: "/Users/joe/Documents/case-files/motion.pdf"'),

	category: DocumentCategory,

	uploadToR2: z.boolean()
		.default(true)
		.describe('Whether to upload PDF to R2 cloud storage. Set false if file should remain local-only.'),

	extractMetadata: z.boolean()
		.default(true)
		.describe('Whether to automatically extract legal metadata using Unstructured.io + Claude API. Recommended: true.'),

	metadata: z.object({
		court: z.string().optional().describe('Court name if known. Example: "65th District Court"'),
		county: z.string().optional().describe('County if known. Example: "El Paso County"'),
		caseNumber: z.string().optional().describe('Case docket number. Example: "CV-2025-12345"'),
		filingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filing date in YYYY-MM-DD format'),
		actors: z.array(z.string()).optional().describe('People mentioned in document. Example: ["Maria dos Santos", "Shawn Cowie"]'),
		legalConcepts: LegalConcepts.optional()
	}).optional().describe('Optional metadata to supplement automatic extraction. Auto-extraction will be merged with provided metadata.')
}).strict();

export type TrackDocumentInput = z.infer<typeof TrackDocumentSchema>;

/**
 * Tool 2: legal_search_documents - Input Schema
 */
export const SearchDocumentsSchema = z.object({
	query: z.string()
		.min(1)
		.max(1000)
		.describe('Natural language search query. Example: "emails showing coordination between Maria and police about protective order"'),

	projects: z.array(z.enum(['azure', 'alt']))
		.optional()
		.describe('Which project(s) to search. Omit to search both. Example: ["alt"] to search only Unstructured approach.'),

	filters: z.object({
		category: z.array(DocumentCategory).optional().describe('Filter by document categories. Example: ["email", "motion"]'),

		actors: z.array(z.string()).optional().describe('Filter by people mentioned. Example: ["Maria dos Santos", "Shawn Cowie"]'),

		legalConcepts: z.array(z.string()).optional().describe('Filter by legal concepts. Example: ["extrinsic_fraud", "brady_violation"]'),

		court: z.string().optional().describe('Filter by court. Example: "65th District Court"'),

		dateRange: DateRangeSchema.optional(),

		privileged: z.boolean().optional().describe('Filter to privileged documents only (attorney-client, work product)')
	}).optional(),

	limit: z.number()
		.int()
		.min(1)
		.max(50)
		.default(10)
		.describe('Maximum number of results to return. Default: 10, Max: 50'),

	responseFormat: z.enum(['json', 'markdown'])
		.default('markdown')
		.describe('Response format: "json" for structured data, "markdown" for human-readable')
}).strict();

export type SearchDocumentsInput = z.infer<typeof SearchDocumentsSchema>;

/**
 * Tool 3: legal_analyze_document - Input Schema
 */
export const AnalyzeDocumentSchema = z.object({
	filePath: z.string()
		.min(1)
		.describe('Absolute path to PDF file to analyze'),

	operations: z.array(z.enum([
		'extract_metadata',
		'classify_document',
		'identify_parties',
		'extract_citations',
		'identify_actors',
		'tag_concepts',
		'summarize'
	]))
		.default(['extract_metadata', 'classify_document'])
		.describe('Analysis operations to perform. Default: extract_metadata and classify_document'),

	deepAnalysis: z.boolean()
		.default(false)
		.describe('Perform deep analysis (slower, more thorough). Uses additional Claude API calls to extract implicit concepts and relationships.')
}).strict();

export type AnalyzeDocumentInput = z.infer<typeof AnalyzeDocumentSchema>;

/**
 * Tool 4: legal_draft_motion - Input Schema
 */
export const DraftMotionSchema = z.object({
	motionType: z.enum([
		'dismiss',
		'summary-judgment',
		'compel',
		'bill-of-review',
		'protective-order',
		'sanctions',
		'reconsideration'
	]).describe('Type of motion to draft'),

	court: z.string()
		.min(1)
		.describe('Court name with full jurisdiction. Example: "65th District Court, El Paso County, Texas"'),

	facts: z.string()
		.min(10)
		.max(10000)
		.describe('Case facts and background. Be comprehensive - this drives the AI drafting.'),

	legalBasis: z.string()
		.min(10)
		.max(5000)
		.describe('Legal arguments and authorities. Example: "Extrinsic fraud per Alexander v Hegadorn; no-fault requirement satisfied..."'),

	caseReferences: z.array(z.string())
		.optional()
		.describe('Case law citations to include. Example: ["Alexander v Hegadorn", "Baker v Goldsmith", "Counterman v Colorado"]'),

	evidenceDocIds: z.array(z.string().uuid())
		.optional()
		.describe('Document UUIDs to cite as evidence. System will retrieve and include as exhibits.'),

	templateVars: z.record(z.string(), z.string())
		.optional()
		.describe('Additional template variables. Example: {"plaintiff": "Dr. John Doe", "defendant": "Maria Pacileo"}')
}).strict();

export type DraftMotionInput = z.infer<typeof DraftMotionSchema>;

/**
 * Tool 5: legal_compare_approaches - Input Schema
 */
export const CompareApproachesSchema = z.object({
	sourceFile: z.string().describe('Original PDF file path that was processed by both approaches'),

	azureDocId: z.string().uuid().optional().describe('Document UUID from Azure project'),

	altDocId: z.string().uuid().optional().describe('Document UUID from Alternative project')
}).strict();

export type CompareApproachesInput = z.infer<typeof CompareApproachesSchema>;

/**
 * Tool 6: legal_get_document - Input Schema
 */
export const GetDocumentSchema = z.object({
	project: ProjectSchema,

	documentId: z.string()
		.uuid()
		.describe('Document UUID to retrieve'),

	includeFullText: z.boolean()
		.default(false)
		.describe('Include full document text in response (may be large)')
}).strict();

export type GetDocumentInput = z.infer<typeof GetDocumentSchema>;

/**
 * JSON Schema versions for MCP Tool definitions
 * (MCP SDK requires JSON Schema, not Zod schemas)
 *
 * Note: We define these manually instead of using zod-to-json-schema
 * to avoid peer dependency conflicts with Zod 4.x
 */
export const TrackDocumentJsonSchema = {
	type: "object",
	properties: {
		project: { type: "string", enum: ["azure", "alt"], default: "alt" },
		title: { type: "string", minLength: 1, maxLength: 500 },
		filePath: { type: "string", minLength: 1 },
		category: { type: "string", enum: ["motion", "case-law", "evidence", "email", "police-report", "court-order", "correspondence"] },
		uploadToR2: { type: "boolean", default: true },
		extractMetadata: { type: "boolean", default: true },
		metadata: {
			type: "object",
			properties: {
				court: { type: "string" },
				county: { type: "string" },
				caseNumber: { type: "string" },
				filingDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
				actors: { type: "array", items: { type: "string" } },
				legalConcepts: { type: "array", items: { type: "string" } }
			}
		}
	},
	required: ["title", "filePath", "category"]
} as const;

export const SearchDocumentsJsonSchema = {
	type: "object",
	properties: {
		query: { type: "string", minLength: 1, maxLength: 1000 },
		projects: { type: "array", items: { type: "string", enum: ["azure", "alt"] } },
		filters: {
			type: "object",
			properties: {
				category: { type: "array", items: { type: "string" } },
				actors: { type: "array", items: { type: "string" } },
				legalConcepts: { type: "array", items: { type: "string" } },
				court: { type: "string" },
				dateRange: {
					type: "object",
					properties: {
						start: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
						end: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
					}
				},
				privileged: { type: "boolean" }
			}
		},
		limit: { type: "number", minimum: 1, maximum: 50, default: 10 },
		responseFormat: { type: "string", enum: ["json", "markdown"], default: "markdown" }
	},
	required: ["query"]
} as const;

export const AnalyzeDocumentJsonSchema = {
	type: "object",
	properties: {
		filePath: { type: "string", minLength: 1 },
		operations: {
			type: "array",
			items: {
				type: "string",
				enum: ["extract_metadata", "classify_document", "identify_parties", "extract_citations", "identify_actors", "tag_concepts", "summarize"]
			},
			default: ["extract_metadata", "classify_document"]
		},
		deepAnalysis: { type: "boolean", default: false }
	},
	required: ["filePath"]
} as const;

export const GetDocumentJsonSchema = {
	type: "object",
	properties: {
		project: { type: "string", enum: ["azure", "alt"], default: "alt" },
		documentId: { type: "string", format: "uuid" },
		includeFullText: { type: "boolean", default: false }
	},
	required: ["documentId"]
} as const;
