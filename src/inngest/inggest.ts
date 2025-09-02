import { Inngest } from "inngest";
import { analyticsService, recommendationService } from "../infrastructure/container";
import { userSyncFunctions } from "./user-sync";

export const inngest = new Inngest({
	id: "api-genii",
});

const recommendationFn = inngest.createFunction(
	{ id: "course-recommendation" },
	{ event: "course/recommendation.triggered" },
	async ({ event, step }) => {
		const { query, userId } = event.data;

		// Process recommendations using our new service
		await step.run("process-recommendations", async () => {
			await recommendationService.processRecommendations({ query, userId });
		});
	},
);

const analyticsProcessingFn = inngest.createFunction(
	{ id: "analytics-processing" },
	{ event: "analytics/process.triggered" },
	async ({ event, step }) => {
		const { userId, activityType, timeSpent, metadata } = event.data;

		// Process analytics updates in background
		await step.run("update-user-analytics", async () => {
			await analyticsService.updateUserAnalytics(userId, {
				activityType,
				timeSpent,
				metadata,
			});
		});

		// Additional analytics processing can be added here
		// e.g., skill analysis, achievement checks, etc.
	},
);

export const functions = [recommendationFn, analyticsProcessingFn, ...userSyncFunctions];
