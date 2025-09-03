import type { Index } from "@upstash/vector";
import { VectorServiceError } from "../../domains/shared/errors";
import type {
	VectorMetadata,
	VectorSearchResult,
	VectorService,
	ResourceMetadata,
	ResourceSearchResult,
} from "../../domains/shared/types";

export class UpstashVectorService implements VectorService {
	constructor(
		private vectorIndex: Index<VectorMetadata>,
		private resourceIndex: Index<ResourceMetadata>,
	) {}

	async searchContext(
		query: string,
		lessonId: string,
		topK: number = 3,
	): Promise<VectorSearchResult[]> {
		try {
			const searchResults = await this.vectorIndex.query({
				data: query,
				topK,
				includeMetadata: true,
				includeVectors: false,
				filter: `type = 'lesson' AND id = '${lessonId}'`,
			});

			return searchResults;
		} catch (error) {
			throw new VectorServiceError(
				`Failed to search context for lesson ${lessonId}`,
				error as Error,
			);
		}
	}

	async searchCourseRecommendations(
		query: string,
		topK: number = 10,
	): Promise<VectorSearchResult[]> {
		try {
			const searchResults = await this.vectorIndex.query({
				data: query,
				topK,
				includeMetadata: true,
				includeVectors: false,
				filter: "type = 'course'",
			});

			return searchResults;
		} catch (error) {
			throw new VectorServiceError(
				"Failed to search course recommendations",
				error as Error,
			);
		}
	}

	async searchResources(
		query: string,
		topK: number = 5,
	): Promise<ResourceSearchResult[]> {
		try {
			const searchResults = await this.resourceIndex.query({
				data: query,
				topK,
				includeMetadata: true,
				includeVectors: false,
			});

			return searchResults;
		} catch (error) {
			throw new VectorServiceError(
				"Failed to search resources",
				error as Error,
			);
		}
	}
}
