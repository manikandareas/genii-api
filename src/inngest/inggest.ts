import { Inngest } from "inngest";
import { recommendationService } from "../infrastructure/container";

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

export const functions = [recommendationFn];
