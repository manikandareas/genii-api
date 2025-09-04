import type { SanityRepository } from "../../infrastructure/database/sanity.repository";
import { VectorServiceError } from "../shared/errors";
import type {
	RecommendationParams,
	RecommendationResult,
	VectorService,
} from "../shared/types";

export interface JobService {
	triggerRecommendationJob(params: {
		query: string;
		userId: string;
	}): Promise<string>;
}

export class RecommendationService {
	constructor(
		private vectorService: VectorService,
		private sanityRepo: SanityRepository,
		private jobService: JobService,
	) {}

	async requestRecommendations(
		params: RecommendationParams,
	): Promise<RecommendationResult> {
		const { query, userId } = params;

		try {
			// Trigger the background job for processing recommendations
			const jobId = await this.jobService.triggerRecommendationJob({
				query,
				userId,
			});

			return {
				status: "processing",
				message: "Rekomendasi sedang diproses",
				jobId,
			};
		} catch (error) {
			console.error("Error requesting recommendations:", error);
			return {
				status: "failed",
				message: "Gagal memproses permintaan rekomendasi",
			};
		}
	}

	// This method will be called by the background job
	async processRecommendations(params: {
		query: string;
		userId: string;
	}): Promise<void> {
		try {
			// Search for course recommendations using vector search
			const searchResults =
				await this.vectorService.searchCourseRecommendations(params.query, 10);

			if (searchResults.length === 0) {
				await this.sanityRepo.upsertRecommendation({
					query: params.query,
					createdFor: params.userId,
					courses: [],
					status: "completed",
					message:
						"Tidak ada kursus yang relevan ditemukan untuk preferensi Anda.",
				});
				return;
			}

			// Extract course IDs from search results
			const courseIds = searchResults
				.filter((result) => result.metadata?.id)
				.map((result) => result.metadata!.id);

			// Get full course details
			const courses = await this.sanityRepo.getCoursesByIds(courseIds);
			const validCourseIds = courses.map((course) => course._id);

			// Save recommendation to database
			await this.sanityRepo.upsertRecommendation({
				query: params.query,
				reason: this.generateRecommendationReason(searchResults),
				createdFor: params.userId,
				courses: validCourseIds,
				status: "completed",
				message: `Ditemukan ${validCourseIds.length} kursus yang sesuai dengan pertanyaan Anda.`,
			});
		} catch (error) {
			console.error("Error processing recommendations:", error);

			// Save failed status
			await this.sanityRepo.upsertRecommendation({
				query: params.query,
				createdFor: params.userId,
				courses: [],
				status: "failed",
				message: "Gagal membuat rekomendasi. Silakan coba lagi nanti.",
			});

			throw new VectorServiceError(
				"Failed to process recommendations",
				error as Error,
			);
		}
	}

	private generateRecommendationReason(searchResults: any[]): string {
		const topScore = searchResults[0]?.score || 0;
		const resultCount = searchResults.length;

		if (topScore > 0.8) {
			return `Ditemukan ${resultCount} kursus yang sangat relevan berdasarkan pertanyaan Anda dengan kesesuaian konten yang sangat baik.`;
		} else if (topScore > 0.6) {
			return `Ditemukan ${resultCount} kursus relevan yang selaras dengan minat belajar Anda.`;
		} else {
			return `Ditemukan ${resultCount} kursus yang mungkin berkaitan dengan pertanyaan Anda.`;
		}
	}
}
