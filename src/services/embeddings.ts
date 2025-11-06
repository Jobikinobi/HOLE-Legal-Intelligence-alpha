/**
 * OpenAI Embeddings Service
 *
 * Generates vector embeddings for legal document search.
 * Uses text-embedding-3-small (1536 dimensions, $0.02/1M tokens)
 */

import OpenAI from 'openai';

export interface EmbeddingResult {
	embedding: number[];
	tokenCount: number;
	model: string;
}

/**
 * OpenAI embeddings client
 */
export class EmbeddingsService {
	private client: OpenAI;
	private model: string = 'text-embedding-3-small';
	private dimensions: number = 1536;

	constructor(apiKey: string) {
		this.client = new OpenAI({ apiKey });
	}

	/**
	 * Generate embedding for a single text
	 */
	async generateEmbedding(text: string): Promise<EmbeddingResult> {
		try {
			const response = await this.client.embeddings.create({
				model: this.model,
				input: text,
				dimensions: this.dimensions
			});

			return {
				embedding: response.data[0].embedding,
				tokenCount: response.usage.total_tokens,
				model: this.model
			};
		} catch (error) {
			console.error('Embedding generation failed:', error);
			throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Generate embeddings for multiple texts (batch)
	 */
	async batchGenerateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
		// OpenAI allows up to 2048 inputs per request
		const batchSize = 2048;
		const results: EmbeddingResult[] = [];

		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);

			try {
				const response = await this.client.embeddings.create({
					model: this.model,
					input: batch,
					dimensions: this.dimensions
				});

				// Add batch results
				for (let j = 0; j < batch.length; j++) {
					results.push({
						embedding: response.data[j].embedding,
						tokenCount: Math.floor(response.usage.total_tokens / batch.length),  // Approximate per text
						model: this.model
					});
				}

				console.log(`Generated embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
			} catch (error) {
				console.error(`Batch ${i}-${i + batchSize} failed:`, error);
				throw error;
			}
		}

		return results;
	}

	/**
	 * Calculate estimated cost for embedding generation
	 */
	estimateCost(tokenCount: number): number {
		// text-embedding-3-small: $0.00002 per 1k tokens
		return (tokenCount / 1000) * 0.00002;
	}

	/**
	 * Chunk text if it exceeds token limit
	 */
	chunkText(text: string, maxTokens: number = 8000): string[] {
		// Simple chunking by character count (approximate 4 chars = 1 token)
		const maxChars = maxTokens * 4;

		if (text.length <= maxChars) {
			return [text];
		}

		const chunks: string[] = [];
		let currentIndex = 0;

		while (currentIndex < text.length) {
			const chunk = text.slice(currentIndex, currentIndex + maxChars);
			chunks.push(chunk);
			currentIndex += maxChars;
		}

		return chunks;
	}
}
