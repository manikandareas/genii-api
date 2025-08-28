import { generateText } from "ai";
import { Inngest } from "inngest";
import { availableModel } from "..";
import { vectorIndex } from "../lib/upstash";
import { updateRecommendationStatus, upsertRecommendation } from "../sanity";
import type { VectorMetadata } from "../utils";

export const inngest = new Inngest({
	id: "api-genii",
});

const recommendationFn = inngest.createFunction(
	{ id: "course-recommendation" },
	{ event: "course/recommendation.triggered" },
	async ({ event, step }) => {
		const query = event.data.query;
		const userId = event.data.userId;

		// Step 1: Create initial recommendation with in_progress status
		const recommendationId = await step.run(
			"create-initial-recommendation",
			async () => {
				try {
					const id = await upsertRecommendation({
						query,
						reason: "", // Will be updated later
						createdFor: userId,
						courses: [], // Will be updated later
						status: "in_progress",
						message: "Searching for relevant courses based on your query...",
					});
					return id;
				} catch (error) {
					throw new Error(
						`Failed to create initial recommendation: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			},
		);

		// Step 2: Perform semantic search
		const courses = await step.run("upstash-semantic-search", async () => {
			try {
				// Update status to indicate search is happening
				await updateRecommendationStatus(
					recommendationId,
					"in_progress",
					"Found relevant courses, now generating personalized recommendations...",
				);

				const courses = await vectorIndex.query<VectorMetadata>({
					data: query,
					includeMetadata: true,
					includeVectors: false,
					topK: 5,
					filter: "type = 'course'",
				});

				if (courses.length === 0) {
					await updateRecommendationStatus(
						recommendationId,
						"failed",
						"No relevant courses found for your query. Please try a different search term.",
					);
					throw new Error("No courses found for the query");
				}

				return courses;
			} catch (error) {
				await updateRecommendationStatus(
					recommendationId,
					"failed",
					`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
				throw error;
			}
		});

		// Step 3: Generate reason/explanation
		const reason = await step.run("generate-reason", async () => {
			try {
				await updateRecommendationStatus(
					recommendationId,
					"in_progress",
					"Finalizing your personalized course recommendations...",
				);

				const { text } = await generateText({
					model: availableModel.main,
					messages: [
						{
							role: "system",
							content:
								"Tulis 2-3 paragraf friendly (maksimal 50 kata) menjelaskan mengapa course ini cocok untuk query pengguna. Gunakan tone ramah dan personal, fokus pada manfaat praktis yang akan didapat.",
						},
						{ role: "user", content: `Query pengguna: ${query}` },
						{
							role: "user",
							content: `Courses (title.difficulty + description): ${JSON.stringify(courses.map((c) => ({ id: c.id, data: c.data })))}`,
						},
					],
				});

				return text;
			} catch (error) {
				await updateRecommendationStatus(
					recommendationId,
					"failed",
					`Failed to generate recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
				throw error;
			}
		});

		// Step 4: Save final recommendations
		await step.run("save-final-recommendations", async () => {
			try {
				await updateRecommendationStatus(
					recommendationId,
					"completed",
					"Recommendations completed successfully! Check out your personalized course suggestions.",
					{
						reason,
						courses: courses.map((course) => course.metadata?.id as string),
					},
				);
			} catch (error) {
				await updateRecommendationStatus(
					recommendationId,
					"failed",
					`Failed to save final recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
				throw error;
			}
		});
	},
);

export const functions = [recommendationFn];
