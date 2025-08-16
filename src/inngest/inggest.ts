import { Inngest } from "inngest";
import { vectorIndex } from "../lib/upstash";
import { saveRecommendation } from "../sanity";

export const inngest = new Inngest({
	id: "api-genii",
});

const recommendationFn = inngest.createFunction(
	{ id: "course-recommendation" },
	{ event: "course/recommendation.triggered" },
	async ({ event, step }) => {
		const query = event.data.query;
		const userId = event.data.userId;

		const courses = await step.run("upstash-semantic-search", async () => {
			const courses = await vectorIndex.query<{ id: string }>({
				data: query,
				includeMetadata: true,
				includeVectors: false,
				topK: 5,
				filter: "type = 'course'",
			});
			return courses;
		});

		await step.run("save-recommendations", async () => {
			saveRecommendation({
				query,
				reason: "You are good at it",
				createdFor: userId,
				courses: courses.map((course) => course.metadata?.id as string),
			});
		});
	},
);

export const functions = [recommendationFn];
