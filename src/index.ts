/**
 * HOLE Legal Intelligence System - MCP Server
 * Cloudflare Workers Deployment
 *
 * Provides AI-powered legal document tracking, search, and drafting via Model Context Protocol (MCP).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type Tool
} from '@modelcontextprotocol/sdk/types.js';

import { NeonService, type ProjectSchema } from './services/neon';
import { PineconeService } from './services/pinecone';
import { EmbeddingsService } from './services/embeddings';
import { processLegalDocument, processDocumentFromR2, generateSearchableContent } from './services/unstructured';

import {
	TrackDocumentSchema,
	SearchDocumentsSchema,
	AnalyzeDocumentSchema,
	GetDocumentSchema,
	TrackDocumentJsonSchema,
	SearchDocumentsJsonSchema,
	AnalyzeDocumentJsonSchema,
	GetDocumentJsonSchema,
	type TrackDocumentInput,
	type SearchDocumentsInput,
	type AnalyzeDocumentInput,
	type GetDocumentInput
} from './schemas/legal-docs';

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
	// Secrets
	NEON_DATABASE_URL: string;
	PINECONE_API_KEY: string;
	OPENAI_API_KEY: string;
	ANTHROPIC_API_KEY: string;
	UNSTRUCTURED_API_KEY: string;

	// Bindings
	NEON?: Hyperdrive;  // Hyperdrive binding for Neon PostgreSQL
	DOCUMENTS_R2?: R2Bucket;  // R2 bucket for PDF storage
	CACHE_KV?: KVNamespace;  // KV for caching
}

/**
 * MCP Server for legal document intelligence
 */
class LegalMCPServer {
	private server: Server;
	private neonService: NeonService;
	private pineconeService: PineconeService;
	private embeddingsService: EmbeddingsService;

	constructor(env: Env) {
		// Initialize MCP server
		this.server = new Server(
			{
				name: 'legal-intelligence-alpha',
				version: '1.0.0'
			},
			{
				capabilities: {
					tools: {}
				}
			}
		);

		// Initialize service clients
		// Note: env.NEON is the Hyperdrive binding configured in wrangler.toml
		if (!env.NEON) {
			throw new Error('Hyperdrive binding (NEON) not configured');
		}
		this.neonService = new NeonService(env.NEON);
		this.pineconeService = new PineconeService(
			env.PINECONE_API_KEY,
			'us-east-1-aws',
			'legal-documents'
		);
		this.embeddingsService = new EmbeddingsService(env.OPENAI_API_KEY);

		// Register MCP handlers
		this.setupHandlers(env);
	}

	/**
	 * Set up MCP protocol handlers
	 */
	private setupHandlers(env: Env): void {
		// List available tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: this.getTools()
			};
		});

		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;

			switch (name) {
				case 'legal_track_document':
					return await this.handleTrackDocument(args as TrackDocumentInput, env);

				case 'legal_search_documents':
					return await this.handleSearchDocuments(args as SearchDocumentsInput, env);

				case 'legal_analyze_document':
					return await this.handleAnalyzeDocument(args as AnalyzeDocumentInput, env);

				case 'legal_get_document':
					return await this.handleGetDocument(args as GetDocumentInput, env);

				default:
					throw new Error(`Unknown tool: ${name}`);
			}
		});
	}

	/**
	 * Define available MCP tools
	 */
	private getTools(): Tool[] {
		return [
			{
				name: 'legal_track_document',
				description: `Add a legal document to the tracking database with automatic metadata extraction.

This tool:
1. Uploads PDF to R2 cloud storage
2. Processes document with Unstructured.io to extract structure
3. Uses Claude API to extract legal metadata (court, actors, concepts, citations)
4. Stores queryable metadata in Neon PostgreSQL
5. Generates embedding and stores in Pinecone for semantic search

**Automatic Metadata Extraction** includes:
- Court, county, jurisdiction
- Case number
- Parties (plaintiff, defendant)
- Actors (all people mentioned)
- Legal concepts (Brady violation, extrinsic fraud, etc.)
- Case law citations
- Dates (filing, decision, event)

**Use when**: Adding new documents to case database, importing evidence, tracking correspondence

**Cost**: ~$0.001 per document (Unstructured API + embeddings)

**Example**:
\`\`\`json
{
  "title": "Motion to Dismiss - Smith v. Jones",
  "filePath": "/Users/joe/case-files/motion.pdf",
  "category": "motion",
  "project": "alt"
}
\`\`\``,
				inputSchema: TrackDocumentJsonSchema as any
			},

			{
				name: 'legal_search_documents',
				description: `Hybrid search across legal documents using SQL filtering + vector similarity.

This tool combines:
1. **SQL filtering** (Neon PostgreSQL): Exact matches on metadata (court, actors, dates, concepts)
2. **Vector search** (Pinecone): Semantic similarity within filtered results

**Use when**: Finding specific documents, researching case law, compiling evidence

**Search strategies**:
- Metadata-only: Fast, exact matches (e.g., "all motions filed in 65th District Court")
- Semantic-only: Conceptual search (e.g., "documents about extrinsic fraud")
- Hybrid: Best of both (e.g., "emails between X and Y mentioning coordination")

**Example**:
\`\`\`json
{
  "query": "coordination about protective order",
  "filters": {
    "category": ["email"],
    "actors": ["Maria dos Santos", "Shawn Cowie"],
    "dateRange": { "start": "2025-09-05", "end": "2025-09-07" }
  },
  "limit": 10
}
\`\`\``,
				inputSchema: SearchDocumentsJsonSchema as any
			},

			{
				name: 'legal_analyze_document',
				description: `Analyze a legal document using Unstructured.io + Claude API.

Performs deep document analysis:
1. Extracts document structure (titles, headers, paragraphs, tables)
2. Classifies document type
3. Identifies parties and actors
4. Extracts case citations
5. Tags legal concepts
6. Generates summary

**Use when**: Processing a new document before tracking, or re-analyzing existing document

**Operations**:
- extract_metadata: Court, case number, dates, parties
- classify_document: Determine document type
- identify_parties: Extract plaintiff, defendant, etc.
- extract_citations: Find all case law citations
- identify_actors: All people mentioned
- tag_concepts: Legal concepts present
- summarize: Generate brief summary

**Example**:
\`\`\`json
{
  "filePath": "/path/to/document.pdf",
  "operations": ["extract_metadata", "extract_citations", "tag_concepts"],
  "deepAnalysis": false
}
\`\`\``,
				inputSchema: AnalyzeDocumentJsonSchema as any
			},

			{
				name: 'legal_get_document',
				description: `Retrieve full document details by UUID.

Returns enriched document data including:
- Core metadata (title, court, case number, dates)
- Parties and actors
- Legal concepts
- Case citations
- Related documents
- Processing history

**Use when**: Need complete document details after search, verifying document data, building exhibits

**Example**:
\`\`\`json
{
  "project": "alt",
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "includeFullText": false
}
\`\`\``,
				inputSchema: GetDocumentJsonSchema as any
			}
		];
	}

	/**
	 * Helper: Read file from R2 or accept file buffer
	 * In Cloudflare Workers, we can't read from local filesystem
	 * Files should be either uploaded to R2 first, or sent as buffers
	 */
	private async readFile(filePathOrR2Key: string, r2Bucket?: R2Bucket): Promise<ArrayBuffer> {
		// If R2 bucket is available, try to read from R2
		if (r2Bucket) {
			const object = await r2Bucket.get(filePathOrR2Key);
			if (object) {
				return await object.arrayBuffer();
			}
		}

		// Fallback: For development/testing, we might fetch from a URL
		// In production, this code path should not be reached
		throw new Error(
			`File not found: ${filePathOrR2Key}. ` +
			`In Cloudflare Workers, files must be uploaded to R2 first. ` +
			`Use the R2 bucket to store files before processing.`
		);
	}

	/**
	 * Tool Handler: legal_track_document
	 */
	private async handleTrackDocument(input: TrackDocumentInput, env: Env) {
		const startTime = Date.now();

		try {
			// Validate input
			const validated = TrackDocumentSchema.parse(input);

			// 1. Verify file exists in R2
			// Note: In Cloudflare Workers, the file should already be uploaded to R2
			// The filePath becomes the R2 key
			let r2Key = validated.filePath;

			// Verify the file exists in R2
			if (env.DOCUMENTS_R2) {
				const exists = await env.DOCUMENTS_R2.head(r2Key);
				if (!exists) {
					throw new Error(
						`File not found in R2: ${r2Key}. ` +
						`Please upload the file to R2 before tracking it. ` +
						`Use: wrangler r2 object put legal-documents/${r2Key} --file /path/to/file.pdf`
					);
				}
			} else {
				throw new Error('R2 bucket (DOCUMENTS_R2) not configured');
			}

			// 2. Process with Unstructured.io + Claude metadata extraction
			let processedDoc;
			if (validated.extractMetadata) {
				// Read file from R2
				const fileBuffer = await this.readFile(r2Key, env.DOCUMENTS_R2);
				processedDoc = await processLegalDocument(
					fileBuffer,
					validated.filePath.split('/').pop() || 'document.pdf',
					{
						unstructuredApiKey: env.UNSTRUCTURED_API_KEY,
						anthropicApiKey: env.ANTHROPIC_API_KEY,
						strategy: 'hi_res'
					}
				);

				// Merge auto-extracted metadata with provided metadata
				if (validated.metadata) {
					processedDoc.metadata = {
						...processedDoc.metadata,
						...validated.metadata
					};
				}
			}

			// 3. Store in Neon PostgreSQL
			const schema: ProjectSchema = validated.project === 'azure' ? 'project_azure' : 'project_alt';
			const documentId = await this.neonService.insertDocument(
				schema,
				processedDoc!.metadata,
				r2Key,
				validated.filePath,
				Date.now() - startTime
			);

			// 4. Generate embedding and store in Pinecone (optional - skip if embeddings not available)
			let embeddingResult: any = null;
			let pineconeIndexed = false;

			try {
				const searchableContent = generateSearchableContent(processedDoc!);
				embeddingResult = await this.embeddingsService.generateEmbedding(searchableContent);

				await this.pineconeService.upsertDocument(
					documentId,
					embeddingResult.embedding,
					{
						project: validated.project,
						category: validated.category,
						title: validated.title,
						court: processedDoc!.metadata.court,
						filing_date: processedDoc!.metadata.filing_date,
						legal_concepts: processedDoc!.metadata.legal_concepts
					}
				);

				// 5. Mark as indexed in Neon
				await this.neonService.markPineconeIndexed(schema, documentId);
				pineconeIndexed = true;
			} catch (embeddingError) {
				console.warn('Embeddings/Pinecone indexing skipped:', embeddingError);
				// Continue without embeddings - document is still stored in Neon
			}

			// 6. Log processing
			await this.neonService.logProcessing(
				schema,
				documentId,
				pineconeIndexed ? 'indexed' : 'processed',
				'success',
				{
					elements_extracted: processedDoc!.elements.length,
					metadata_fields: Object.keys(processedDoc!.metadata).length,
					embedding_tokens: embeddingResult?.tokenCount || 0,
					pinecone_indexed: pineconeIndexed
				},
				Date.now() - startTime,
				(embeddingResult ? this.embeddingsService.estimateCost(embeddingResult.tokenCount) : 0) + 0.0001  // Unstructured cost
			);

			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({
						success: true,
						document_id: documentId,
						project: validated.project,
						processing_time_ms: Date.now() - startTime,
						metadata_extracted: processedDoc!.metadata,
						stats: processedDoc!.stats
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error',
						processing_time_ms: Date.now() - startTime
					}, null, 2)
				}],
				isError: true
			};
		}
	}

	/**
	 * Tool Handler: legal_search_documents
	 */
	private async handleSearchDocuments(input: SearchDocumentsInput, env: Env) {
		try {
			const validated = SearchDocumentsSchema.parse(input);
			const schemas: ProjectSchema[] = validated.projects
				? validated.projects.map(p => (p === 'azure' ? 'project_azure' : 'project_alt'))
				: ['project_azure', 'project_alt'];

			// 1. Filter by metadata in Neon SQL
			let filteredDocIds: string[] = [];
			for (const schema of schemas) {
				const ids = await this.neonService.searchByFilters(schema, validated.filters || {});
				filteredDocIds = [...filteredDocIds, ...ids];
			}

			if (filteredDocIds.length === 0) {
				return {
					content: [{
						type: 'text' as const,
						text: 'No documents match the specified filters.'
					}]
				};
			}

			// 2. Generate query embedding
			const queryEmbedding = await this.embeddingsService.generateEmbedding(validated.query);

			// 3. Search Pinecone within filtered documents
			const vectorResults = await this.pineconeService.search(
				queryEmbedding.embedding,
				{
					project: validated.projects?.[0],  // If single project specified
					documentIds: filteredDocIds,
					topK: validated.limit
				}
			);

			// 4. Enrich results with full metadata from Neon
			const enrichedResults = await Promise.all(
				vectorResults.map(async (result) => {
					const schema = result.metadata.project === 'azure' ? 'project_azure' : 'project_alt';
					const doc = await this.neonService.getDocument(schema, result.id);
					return {
						...result,
						document: doc
					};
				})
			);

			// 5. Format response
			if (validated.responseFormat === 'json') {
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							total_filtered: filteredDocIds.length,
							results_returned: enrichedResults.length,
							results: enrichedResults
						}, null, 2)
					}]
				};
			} else {
				// Markdown format
				const markdown = this.formatSearchResultsMarkdown(enrichedResults, filteredDocIds.length);
				return {
					content: [{
						type: 'text' as const,
						text: markdown
					}]
				};
			}
		} catch (error) {
			return {
				content: [{
					type: 'text' as const,
					text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				}],
				isError: true
			};
		}
	}

	/**
	 * Tool Handler: legal_analyze_document
	 */
	private async handleAnalyzeDocument(input: AnalyzeDocumentInput, env: Env) {
		try {
			const validated = AnalyzeDocumentSchema.parse(input);

			// Process document with Unstructured + Claude
			// Read from R2 (filePath is treated as R2 key)
			const fileBuffer = await this.readFile(validated.filePath, env.DOCUMENTS_R2);
			const processed = await processLegalDocument(
				fileBuffer,
				validated.filePath.split('/').pop() || 'document.pdf',
				{
					unstructuredApiKey: env.UNSTRUCTURED_API_KEY,
					anthropicApiKey: env.ANTHROPIC_API_KEY,
					strategy: validated.deepAnalysis ? 'hi_res' : 'fast'
				}
			);

			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({
						metadata: processed.metadata,
						stats: processed.stats,
						elements_by_type: this.summarizeElements(processed.elements)
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: 'text' as const,
					text: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				}],
				isError: true
			};
		}
	}

	/**
	 * Tool Handler: legal_get_document
	 */
	private async handleGetDocument(input: GetDocumentInput, env: Env) {
		try {
			const validated = GetDocumentSchema.parse(input);
			const schema: ProjectSchema = validated.project === 'azure' ? 'project_azure' : 'project_alt';

			const document = await this.neonService.getDocument(schema, validated.documentId);

			if (!document) {
				return {
					content: [{
						type: 'text' as const,
						text: `Document not found: ${validated.documentId}`
					}],
					isError: true
				};
			}

			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify(document, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: 'text' as const,
					text: `Failed to retrieve document: ${error instanceof Error ? error.message : 'Unknown error'}`
				}],
				isError: true
			};
		}
	}

	/**
	 * Format search results as markdown
	 */
	private formatSearchResultsMarkdown(results: any[], totalFiltered: number): string {
		let markdown = `# Legal Document Search Results\n\n`;
		markdown += `**Total documents matching filters**: ${totalFiltered}\n`;
		markdown += `**Results returned**: ${results.length}\n\n`;
		markdown += `---\n\n`;

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const doc = result.document;

			markdown += `## ${i + 1}. ${doc.title}\n\n`;
			markdown += `- **Relevance Score**: ${(result.score * 100).toFixed(1)}%\n`;
			markdown += `- **Category**: ${doc.category}\n`;
			if (doc.court) markdown += `- **Court**: ${doc.court}\n`;
			if (doc.case_number) markdown += `- **Case Number**: ${doc.case_number}\n`;
			if (doc.filing_date) markdown += `- **Filed**: ${doc.filing_date}\n`;
			if (doc.actors) markdown += `- **Actors**: ${doc.actors.map((a: any) => a.name).join(', ')}\n`;
			if (doc.legal_concepts) markdown += `- **Legal Concepts**: ${doc.legal_concepts.join(', ')}\n`;
			markdown += `- **Document ID**: \`${doc.id}\`\n`;
			markdown += `\n`;
		}

		return markdown;
	}

	/**
	 * Summarize Unstructured elements by type
	 */
	private summarizeElements(elements: any[]): Record<string, number> {
		const summary: Record<string, number> = {};
		for (const element of elements) {
			summary[element.type] = (summary[element.type] || 0) + 1;
		}
		return summary;
	}

	/**
	 * Run MCP server
	 */
	async run(): Promise<void> {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('Legal Intelligence MCP Server running on stdio');
	}
}

/**
 * JSON-RPC 2.0 Request/Response types
 */
interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: any;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

/**
 * Cloudflare Workers fetch handler with MCP HTTP Transport
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				}
			});
		}

		// Health check endpoint
		if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
			return new Response(JSON.stringify({
				service: 'HOLE Legal Intelligence Alpha',
				status: 'online',
				version: '1.0.0',
				timestamp: new Date().toISOString()
			}), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		// Only accept POST for MCP requests
		if (request.method !== 'POST') {
			return new Response('Method not allowed', {
				status: 405,
				headers: { 'Access-Control-Allow-Origin': '*' }
			});
		}

		try {
			// Parse JSON-RPC request
			const jsonRpcRequest = await request.json() as JsonRpcRequest;

			// Validate JSON-RPC 2.0 format
			if (jsonRpcRequest.jsonrpc !== '2.0') {
				return jsonRpcError(jsonRpcRequest.id || null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
			}

			// Initialize MCP server instance
			const mcpServer = new LegalMCPServer(env);

			// Route to appropriate handler
			let result: any;

			switch (jsonRpcRequest.method) {
				case 'initialize':
					result = {
						protocolVersion: '2024-11-05',
						capabilities: {
							tools: {}
						},
						serverInfo: {
							name: 'legal-intelligence-alpha',
							version: '1.0.0'
						}
					};
					break;

				case 'tools/list':
					result = {
						tools: mcpServer['getTools']()  // Access private method
					};
					break;

				case 'tools/call':
					const { name, arguments: args } = jsonRpcRequest.params || {};

					if (!name) {
						return jsonRpcError(jsonRpcRequest.id || null, -32602, 'Invalid params: name is required');
					}

					// Call the appropriate tool handler
					switch (name) {
						case 'legal_track_document':
							result = await mcpServer['handleTrackDocument'](args, env);
							break;

						case 'legal_search_documents':
							result = await mcpServer['handleSearchDocuments'](args, env);
							break;

						case 'legal_analyze_document':
							result = await mcpServer['handleAnalyzeDocument'](args, env);
							break;

						case 'legal_get_document':
							result = await mcpServer['handleGetDocument'](args, env);
							break;

						default:
							return jsonRpcError(jsonRpcRequest.id || null, -32601, `Method not found: ${name}`);
					}
					break;

				default:
					return jsonRpcError(jsonRpcRequest.id || null, -32601, `Method not found: ${jsonRpcRequest.method}`);
			}

			// Return JSON-RPC success response
			return jsonRpcSuccess(jsonRpcRequest.id || null, result);

		} catch (error) {
			console.error('MCP Server error:', error);
			return jsonRpcError(null, -32603, `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
};

/**
 * Create JSON-RPC 2.0 success response
 */
function jsonRpcSuccess(id: string | number | null, result: any): Response {
	const response: JsonRpcResponse = {
		jsonrpc: '2.0',
		id,
		result
	};

	return new Response(JSON.stringify(response), {
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		}
	});
}

/**
 * Create JSON-RPC 2.0 error response
 */
function jsonRpcError(id: string | number | null, code: number, message: string, data?: any): Response {
	const response: JsonRpcResponse = {
		jsonrpc: '2.0',
		id,
		error: {
			code,
			message,
			...(data && { data })
		}
	};

	return new Response(JSON.stringify(response), {
		status: 200,  // JSON-RPC errors use 200 status with error object
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		}
	});
}
