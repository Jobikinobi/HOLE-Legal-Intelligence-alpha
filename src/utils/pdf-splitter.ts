/**
 * PDF Splitting Utility
 *
 * Splits chaotic multi-document PDFs into discrete documents based on detected boundaries.
 * Uses pdf-lib for in-memory PDF manipulation (works in Cloudflare Workers).
 */

import { PDFDocument } from 'pdf-lib';
import type { DocumentBoundary } from '../services/document-decomposer';

export interface SplitPDFResult {
	boundary: DocumentBoundary;
	pdfBytes: Uint8Array;
	suggestedFileName: string;
	pageCount: number;
}

/**
 * Split a PDF into multiple PDFs based on page boundaries
 */
export async function splitPDF(
	sourcePdfBytes: ArrayBuffer,
	boundaries: DocumentBoundary[]
): Promise<SplitPDFResult[]> {
	// Load source PDF
	const sourcePdf = await PDFDocument.load(sourcePdfBytes);
	const totalPages = sourcePdf.getPageCount();

	const results: SplitPDFResult[] = [];

	for (const boundary of boundaries) {
		try {
			// Create new PDF document
			const newPdf = await PDFDocument.create();

			// Validate page range
			const startPage = Math.max(1, boundary.start_page);
			const endPage = Math.min(totalPages, boundary.end_page);

			if (startPage > endPage) {
				console.warn(`Invalid page range for boundary: ${startPage}-${endPage}`);
				continue;
			}

			// Copy pages from source to new PDF
			// Note: PDFDocument uses 0-based indexing
			const pagesToCopy = Array.from(
				{ length: endPage - startPage + 1 },
				(_, i) => startPage - 1 + i
			);

			const copiedPages = await newPdf.copyPages(sourcePdf, pagesToCopy);

			for (const page of copiedPages) {
				newPdf.addPage(page);
			}

			// Save as bytes
			const pdfBytes = await newPdf.save();

			// Generate suggested filename
			const suggestedFileName = sanitizeFileName(
				`${boundary.document_type}_${boundary.title}_p${startPage}-${endPage}.pdf`
			);

			results.push({
				boundary,
				pdfBytes,
				suggestedFileName,
				pageCount: endPage - startPage + 1
			});
		} catch (error) {
			console.error(`Failed to split pages ${boundary.start_page}-${boundary.end_page}:`, error);
		}
	}

	return results;
}

/**
 * Split PDF and save to filesystem (for local development)
 */
export async function splitPDFToFiles(
	sourcePdfPath: string,
	boundaries: DocumentBoundary[],
	outputDir: string
): Promise<string[]> {
	// Read source PDF
	const fs = await import('fs/promises');
	const sourcePdfBytes = await fs.readFile(sourcePdfPath);

	// Split PDF
	const splitResults = await splitPDF(sourcePdfBytes.buffer, boundaries);

	// Save each split PDF
	const outputPaths: string[] = [];

	for (const result of splitResults) {
		const outputPath = `${outputDir}/${result.suggestedFileName}`;
		await fs.writeFile(outputPath, result.pdfBytes);
		outputPaths.push(outputPath);
		console.log(`Created: ${outputPath} (${result.pageCount} pages)`);
	}

	return outputPaths;
}

/**
 * Split PDF and upload to R2 (for Cloudflare Workers)
 */
export async function splitPDFToR2(
	sourcePdfBytes: ArrayBuffer,
	boundaries: DocumentBoundary[],
	r2Bucket: R2Bucket,
	r2Prefix: string  // e.g., "decomposed/original_filename/"
): Promise<Array<{ boundary: DocumentBoundary; r2Key: string }>> {
	const splitResults = await splitPDF(sourcePdfBytes, boundaries);

	const uploadResults: Array<{ boundary: DocumentBoundary; r2Key: string }> = [];

	for (const result of splitResults) {
		const r2Key = `${r2Prefix}${result.suggestedFileName}`;

		await r2Bucket.put(r2Key, result.pdfBytes, {
			httpMetadata: {
				contentType: 'application/pdf'
			},
			customMetadata: {
				document_type: result.boundary.document_type,
				page_range: `${result.boundary.start_page}-${result.boundary.end_page}`,
				confidence: result.boundary.confidence.toString()
			}
		});

		uploadResults.push({
			boundary: result.boundary,
			r2Key
		});

		console.log(`Uploaded to R2: ${r2Key}`);
	}

	return uploadResults;
}

/**
 * Sanitize filename for safe filesystem/R2 use
 */
function sanitizeFileName(fileName: string): string {
	return fileName
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')  // Replace invalid chars with dash
		.replace(/^-+|-+$/g, '')          // Remove leading/trailing dashes
		.replace(/-{2,}/g, '-')           // Collapse multiple dashes
		.slice(0, 200);                   // Limit length
}

/**
 * Validate boundaries before splitting
 */
export function validateBoundaries(
	boundaries: DocumentBoundary[],
	totalPages: number
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check for gaps
	for (let i = 0; i < boundaries.length - 1; i++) {
		const current = boundaries[i];
		const next = boundaries[i + 1];

		if (current.end_page + 1 < next.start_page) {
			errors.push(`Gap detected: pages ${current.end_page + 1} to ${next.start_page - 1} not assigned to any document`);
		}

		if (current.end_page >= next.start_page) {
			errors.push(`Overlap detected: boundary ${i} (pages ${current.start_page}-${current.end_page}) overlaps with boundary ${i + 1} (pages ${next.start_page}-${next.end_page})`);
		}
	}

	// Check bounds
	for (const boundary of boundaries) {
		if (boundary.start_page < 1) {
			errors.push(`Invalid start page: ${boundary.start_page} (must be >= 1)`);
		}
		if (boundary.end_page > totalPages) {
			errors.push(`Invalid end page: ${boundary.end_page} (PDF only has ${totalPages} pages)`);
		}
		if (boundary.start_page > boundary.end_page) {
			errors.push(`Invalid range: start ${boundary.start_page} > end ${boundary.end_page}`);
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
