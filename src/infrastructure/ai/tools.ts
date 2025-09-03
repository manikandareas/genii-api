import { tool } from "ai";
import { z } from "zod";
import type { VectorService } from "../../domains/shared/types";

export const createSearchResourcesTool = (vectorService: VectorService) => {
	return tool({
		description:
			"Search for relevant course resources and learning materials based on a query. Use this when the user asks about specific topics, concepts, or needs additional learning resources.",
		inputSchema: z.object({
			query: z
				.string()
				.describe("The search query to find relevant course resources"),
			topK: z
				.number()
				.optional()
				.default(5)
				.describe("Number of results to return (default: 5)"),
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
					error: "Failed to search resources",
					totalResults: 0,
					resources: [],
				};
			}
		},
	});
};
