import { generateText } from "ai";
import { Inngest } from "inngest";
import { availableModel } from "..";
import { vectorIndex } from "../lib/upstash";
import { upsertRecommendation } from "../sanity";
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

		const courses = await step.run("upstash-semantic-search", async () => {
			const courses = await vectorIndex.query<VectorMetadata>({
				data: query,
				includeMetadata: true,
				includeVectors: false,
				topK: 5,
				filter: "type = 'course'",
			});
			return courses;
		});

		const reason = await step.run("generate-reason", async () => {
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
		});

		await step.run("save-recommendations", async () => {
			await upsertRecommendation({
				query,
				reason: reason,
				createdFor: userId,
				courses: courses.map((course) => course.metadata?.id as string),
			});
		});
	},
);

export const functions = [recommendationFn];
