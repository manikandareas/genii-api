import { tool } from "ai";
import { z } from "zod";
import type { VectorService } from "../../domains/shared/types";

export const createSearchResourcesTool = (vectorService: VectorService) => {
	return tool({
		description:
			"Mencari sumber belajar dan materi kursus yang relevan berdasarkan pertanyaan. Gunakan ini ketika pengguna bertanya tentang topik tertentu, konsep, atau membutuhkan sumber belajar tambahan.",
		inputSchema: z.object({
			query: z
				.string()
				.describe("Kata kunci pencarian untuk menemukan sumber belajar yang relevan"),
			topK: z
				.number()
				.optional()
				.default(5)
				.describe("Jumlah hasil yang dikembalikan (default: 5)"),
		}),
		execute: async ({ query, topK = 5 }) => {
			try {
				const results = await vectorService.searchResources(query, topK);

				// Format results for better AI consumption
				const formattedResults = results.map((result, index) => ({
					rank: index + 1,
					relevanceScore: result.score,
					content: result.data || "No content available",
					url: result.metadata?.url || "No URL available",
					chunkIndex: result.metadata?.chunkIndex || 0,
				}));

				return {
					query,
					totalResults: results.length,
					resources: formattedResults,
				};
			} catch (error) {
				return {
					query,
					error: "Gagal mencari sumber belajar",
					totalResults: 0,
					resources: [],
				};
			}
		},
	});
};
