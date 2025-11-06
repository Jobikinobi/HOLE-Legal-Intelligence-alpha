/**
 * Neon PostgreSQL Service Client
 *
 * Handles all database operations for legal document tracking.
 * Supports multi-tenant architecture (shared, project_azure, project_alt schemas).
 */

import type { LegalMetadata } from './metadata-extractor';

export type ProjectSchema = 'project_azure' | 'project_alt';

export interface DocumentRecord {
	id: string;
	title: string;
	file_path: string;
	r2_key?: string;
	category: string;
	content_summary?: string;
	court?: string;
	county?: string;
	jurisdiction?: string;
	case_number?: string;
	filing_date?: string;
	processing_method: string;
	processing_time_ms?: number;
	extraction_confidence?: number;
	pinecone_indexed: boolean;
	created_at: string;
	updated_at: string;
}

/**
 * Neon client for legal document database operations
 */
export class NeonService {
	constructor(private databaseUrl: string) {}

	/**
	 * Insert a new document with extracted metadata
	 */
	async insertDocument(
		schema: ProjectSchema,
		metadata: LegalMetadata,
		r2Key: string,
		filePath: string,
		processingTimeMs: number
	): Promise<string> {
		// This will be implemented with proper SQL escaping
		const query = `
			INSERT INTO ${schema}.documents (
				title, file_path, r2_key, category,
				court, county, jurisdiction, case_number,
				filing_date, decision_date, event_date,
				processing_method, processing_time_ms, extraction_confidence,
				pinecone_indexed
			) VALUES (
				$1, $2, $3, $4,
				$5, $6, $7, $8,
				$9, $10, $11,
				$12, $13, $14,
				$15
			)
			RETURNING id
		`;

		const params = [
			metadata.title,
			filePath,
			r2Key,
			metadata.document_type,
			metadata.court,
			metadata.county,
			metadata.jurisdiction,
			metadata.case_number,
			metadata.filing_date,
			metadata.decision_date,
			metadata.event_date,
			'unstructured',
			processingTimeMs,
			metadata.extraction_confidence || 0.8,
			false  // Will be set to true after Pinecone indexing
		];

		// Execute query and return document ID
		// (Actual Hyperdrive/Neon query execution will be added)
		const result = await this.executeQuery(query, params);
		const documentId = result.rows[0].id;

		// Insert related data (parties, actors, concepts, citations)
		await this.insertRelatedMetadata(schema, documentId, metadata);

		return documentId;
	}

	/**
	 * Insert related metadata (actors, concepts, citations, etc.)
	 */
	private async insertRelatedMetadata(
		schema: ProjectSchema,
		documentId: string,
		metadata: LegalMetadata
	): Promise<void> {
		// Insert parties
		if (metadata.parties) {
			for (const [partyType, names] of Object.entries(metadata.parties)) {
				for (const name of names || []) {
					await this.executeQuery(
						`INSERT INTO ${schema}.document_parties (document_id, party_type, party_name)
						 VALUES ($1, $2, $3)
						 ON CONFLICT DO NOTHING`,
						[documentId, partyType, name]
					);
				}
			}
		}

		// Insert actors
		if (metadata.actors) {
			for (const actorName of metadata.actors) {
				// Get or create actor
				const actorResult = await this.executeQuery(
					`INSERT INTO ${schema}.actors (name, normalized_name)
					 VALUES ($1, $2)
					 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
					 RETURNING id`,
					[actorName, actorName.toLowerCase()]
				);

				const actorId = actorResult.rows[0].id;

				// Link document to actor
				await this.executeQuery(
					`INSERT INTO ${schema}.document_actors (document_id, actor_id)
					 VALUES ($1, $2)
					 ON CONFLICT DO NOTHING`,
					[documentId, actorId]
				);
			}
		}

		// Insert legal concepts
		if (metadata.legal_concepts) {
			for (const concept of metadata.legal_concepts) {
				await this.executeQuery(
					`INSERT INTO ${schema}.legal_concepts (document_id, concept, source)
					 VALUES ($1, $2, $3)
					 ON CONFLICT DO NOTHING`,
					[documentId, concept, 'claude_extraction']
				);
			}
		}

		// Insert case citations
		if (metadata.case_citations) {
			for (const citation of metadata.case_citations) {
				await this.executeQuery(
					`INSERT INTO ${schema}.case_citations (source_document_id, case_name, citation, holding)
					 VALUES ($1, $2, $3, $4)`,
					[documentId, citation.case_name, citation.citation || null, citation.holding || null]
				);
			}
		}
	}

	/**
	 * Search documents by filters (SQL query)
	 */
	async searchByFilters(
		schema: ProjectSchema,
		filters: {
			category?: string[];
			actors?: string[];
			legalConcepts?: string[];
			court?: string;
			dateRange?: { start?: string; end?: string };
		}
	): Promise<string[]> {
		let query = `
			SELECT DISTINCT d.id
			FROM ${schema}.documents d
		`;

		const conditions: string[] = [];
		const params: any[] = [];
		let paramIndex = 1;

		// Build WHERE clause dynamically
		if (filters.category && filters.category.length > 0) {
			conditions.push(`d.category = ANY($${paramIndex})`);
			params.push(filters.category);
			paramIndex++;
		}

		if (filters.court) {
			conditions.push(`d.court = $${paramIndex}`);
			params.push(filters.court);
			paramIndex++;
		}

		if (filters.dateRange?.start) {
			conditions.push(`d.filing_date >= $${paramIndex}`);
			params.push(filters.dateRange.start);
			paramIndex++;
		}

		if (filters.dateRange?.end) {
			conditions.push(`d.filing_date <= $${paramIndex}`);
			params.push(filters.dateRange.end);
			paramIndex++;
		}

		// Actor filter (requires JOIN)
		if (filters.actors && filters.actors.length > 0) {
			query += `
				JOIN ${schema}.document_actors da ON d.id = da.document_id
				JOIN ${schema}.actors a ON da.actor_id = a.id
			`;
			conditions.push(`a.name = ANY($${paramIndex})`);
			params.push(filters.actors);
			paramIndex++;
		}

		// Legal concept filter (requires JOIN)
		if (filters.legalConcepts && filters.legalConcepts.length > 0) {
			query += `
				JOIN ${schema}.legal_concepts lc ON d.id = lc.document_id
			`;
			conditions.push(`lc.concept = ANY($${paramIndex})`);
			params.push(filters.legalConcepts);
			paramIndex++;
		}

		// Add WHERE clause
		if (conditions.length > 0) {
			query += ` WHERE ` + conditions.join(' AND ');
		}

		const result = await this.executeQuery(query, params);
		return result.rows.map((row: any) => row.id);
	}

	/**
	 * Get full document details with enriched metadata
	 */
	async getDocument(schema: ProjectSchema, documentId: string): Promise<any> {
		const query = `SELECT * FROM ${schema}.documents_enriched WHERE id = $1`;
		const result = await this.executeQuery(query, [documentId]);
		return result.rows[0] || null;
	}

	/**
	 * Mark document as indexed in Pinecone
	 */
	async markPineconeIndexed(schema: ProjectSchema, documentId: string): Promise<void> {
		await this.executeQuery(
			`UPDATE ${schema}.documents SET pinecone_indexed = true, updated_at = NOW() WHERE id = $1`,
			[documentId]
		);
	}

	/**
	 * Log processing operation
	 */
	async logProcessing(
		schema: ProjectSchema,
		documentId: string,
		operation: string,
		status: 'success' | 'failed' | 'partial',
		details: Record<string, any>,
		processingTimeMs: number,
		costEstimate?: number
	): Promise<void> {
		await this.executeQuery(
			`INSERT INTO ${schema}.processing_log
			 (document_id, operation, status, details, processing_time_ms, cost_estimate)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			[documentId, operation, status, JSON.stringify(details), processingTimeMs, costEstimate || 0]
		);
	}

	/**
	 * Execute query (will be replaced with actual Hyperdrive execution)
	 */
	private async executeQuery(query: string, params: any[]): Promise<any> {
		// Placeholder - will be implemented with Cloudflare Hyperdrive binding
		// For now, this shows the interface
		console.log('Query:', query);
		console.log('Params:', params);

		return {
			rows: []  // Placeholder
		};
	}
}
