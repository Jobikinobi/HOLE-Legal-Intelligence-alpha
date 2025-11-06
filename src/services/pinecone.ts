/**
 * Pinecone Vector Database Service
 *
 * Handles vector storage and semantic search for legal documents.
 * Integrates with Neon PostgreSQL via document UUIDs.
 */

import { Pinecone } from '@pinecone-database/pinecone';

export interface VectorMetadata {
	project: 'azure' | 'alt';
	category: string;
	title: string;
	court?: string;
	filing_date?: string;
	legal_concepts?: string[];
}

export interface SearchResult {
	id: string;
	score: number;
	metadata: VectorMetadata;
}

/**
 * Pinecone client for vector operations
 */
export class PineconeService {
	private client: Pinecone;
	private indexName: string;

	constructor(apiKey: string, environment: string = 'us-east-1-aws', indexName: string = 'legal-documents') {
		this.client = new Pinecone({ apiKey });
		this.indexName = indexName;
	}

	/**
	 * Upsert document embedding to Pinecone
	 */
	async upsertDocument(
		documentId: string,
		embedding: number[],
		metadata: VectorMetadata
	): Promise<void> {
		const index = this.client.index(this.indexName);

		await index.upsert([
			{
				id: documentId,
				values: embedding,
				metadata: {
					...metadata,
					// Flatten legal_concepts array for Pinecone metadata filtering
					legal_concepts: metadata.legal_concepts?.join(',') || ''
				}
			}
		]);
	}

	/**
	 * Batch upsert multiple documents
	 */
	async batchUpsert(
		documents: Array<{
			id: string;
			embedding: number[];
			metadata: VectorMetadata;
		}>,
		batchSize: number = 100
	): Promise<void> {
		const index = this.client.index(this.indexName);

		// Process in batches
		for (let i = 0; i < documents.length; i += batchSize) {
			const batch = documents.slice(i, i + batchSize);

			await index.upsert(
				batch.map(doc => ({
					id: doc.id,
					values: doc.embedding,
					metadata: {
						...doc.metadata,
						legal_concepts: doc.metadata.legal_concepts?.join(',') || ''
					}
				}))
			);

			console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
		}
	}

	/**
	 * Semantic search with optional metadata filtering
	 */
	async search(
		queryEmbedding: number[],
		options: {
			project?: 'azure' | 'alt';
			category?: string[];
			documentIds?: string[];  // Filter to specific document IDs (from SQL)
			topK?: number;
		} = {}
	): Promise<SearchResult[]> {
		const index = this.client.index(this.indexName);

		// Build metadata filter
		const filter: Record<string, any> = {};

		if (options.project) {
			filter.project = { $eq: options.project };
		}

		if (options.category && options.category.length > 0) {
			filter.category = { $in: options.category };
		}

		// Most important: Filter to specific document IDs from SQL query
		if (options.documentIds && options.documentIds.length > 0) {
			filter.id = { $in: options.documentIds };
		}

		// Execute vector search
		const results = await index.query({
			vector: queryEmbedding,
			topK: options.topK || 10,
			filter: Object.keys(filter).length > 0 ? filter : undefined,
			includeMetadata: true
		});

		return results.matches?.map(match => ({
			id: match.id,
			score: match.score || 0,
			metadata: {
				...match.metadata,
				legal_concepts: match.metadata?.legal_concepts
					? (match.metadata.legal_concepts as string).split(',')
					: []
			} as VectorMetadata
		})) || [];
	}

	/**
	 * Find similar documents to a given document
	 */
	async findSimilar(
		documentId: string,
		options: {
			project?: 'azure' | 'alt';
			topK?: number;
		} = {}
	): Promise<SearchResult[]> {
		const index = this.client.index(this.indexName);

		// Fetch the document's embedding
		const fetchResult = await index.fetch([documentId]);
		const embedding = fetchResult.records?.[documentId]?.values;

		if (!embedding) {
			throw new Error(`Document ${documentId} not found in Pinecone`);
		}

		// Search for similar documents (excluding itself)
		const filter: Record<string, any> = {
			id: { $ne: documentId }  // Exclude self
		};

		if (options.project) {
			filter.project = { $eq: options.project };
		}

		const results = await index.query({
			vector: embedding,
			topK: options.topK || 10,
			filter,
			includeMetadata: true
		});

		return results.matches?.map(match => ({
			id: match.id,
			score: match.score || 0,
			metadata: match.metadata as VectorMetadata
		})) || [];
	}

	/**
	 * Delete document from Pinecone
	 */
	async deleteDocument(documentId: string): Promise<void> {
		const index = this.client.index(this.indexName);
		await index.deleteOne(documentId);
	}

	/**
	 * Get index statistics
	 */
	async getStats(): Promise<any> {
		const index = this.client.index(this.indexName);
		return await index.describeIndexStats();
	}
}
