import type { 
  RecommendationParams, 
  RecommendationResult,
  VectorService 
} from "../shared/types";
import type { SanityRepository } from "../../infrastructure/database/sanity.repository";
import { VectorServiceError } from "../shared/errors";

export interface JobService {
  triggerRecommendationJob(params: { query: string; userId: string }): Promise<string>;
}

export class RecommendationService {
  constructor(
    private vectorService: VectorService,
    private sanityRepo: SanityRepository,
    private jobService: JobService
  ) {}

  async requestRecommendations(params: RecommendationParams): Promise<RecommendationResult> {
    const { query, userId } = params;

    try {
      // Trigger the background job for processing recommendations
      const jobId = await this.jobService.triggerRecommendationJob({
        query,
        userId
      });

      return {
        status: 'processing',
        message: 'Recommendations are being processed',
        jobId
      };
    } catch (error) {
      console.error("Error requesting recommendations:", error);
      return {
        status: 'failed',
        message: 'Failed to process recommendation request'
      };
    }
  }

  // This method will be called by the background job
  async processRecommendations(params: { query: string; userId: string }): Promise<void> {
    try {
      // Search for course recommendations using vector search
      const searchResults = await this.vectorService.searchCourseRecommendations(params.query, 10);

      if (searchResults.length === 0) {
        await this.sanityRepo.upsertRecommendation({
          query: params.query,
          createdFor: params.userId,
          courses: [],
          status: 'completed',
          message: 'No relevant courses found for your query.',
        });
        return;
      }

      // Extract course IDs from search results
      const courseIds = searchResults
        .filter(result => result.metadata?.id)
        .map(result => result.metadata!.id);

      // Get full course details
      const courses = await this.sanityRepo.getCoursesByIds(courseIds);
      const validCourseIds = courses.map((course: any) => course._id);

      // Save recommendation to database
      await this.sanityRepo.upsertRecommendation({
        query: params.query,
        reason: this.generateRecommendationReason(searchResults),
        createdFor: params.userId,
        courses: validCourseIds,
        status: 'completed',
        message: `Found ${validCourseIds.length} courses that match your query.`,
      });

    } catch (error) {
      console.error("Error processing recommendations:", error);
      
      // Save failed status
      await this.sanityRepo.upsertRecommendation({
        query: params.query,
        createdFor: params.userId,
        courses: [],
        status: 'failed',
        message: 'Failed to generate recommendations. Please try again later.',
      });

      throw new VectorServiceError("Failed to process recommendations", error as Error);
    }
  }

  private generateRecommendationReason(searchResults: any[]): string {
    const topScore = searchResults[0]?.score || 0;
    const resultCount = searchResults.length;

    if (topScore > 0.8) {
      return `Found ${resultCount} highly relevant courses based on your query with excellent content match.`;
    } else if (topScore > 0.6) {
      return `Found ${resultCount} relevant courses that align well with your learning interests.`;
    } else {
      return `Found ${resultCount} courses that may be related to your query.`;
    }
  }
}