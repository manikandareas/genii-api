import type { Inngest } from "inngest";
import type { JobService } from "../../domains/recommendations/recommendation.service";

export class InngestJobService implements JobService {
	constructor(private inngest: Inngest) {}

	async triggerRecommendationJob(params: {
		query: string;
		userId: string;
	}): Promise<string> {
		const event = await this.inngest.send({
			name: "course/recommendation.triggered",
			data: {
				query: params.query,
				userId: params.userId,
			},
		});

		// Return the event ID as job ID
		return Array.isArray(event.ids) ? event.ids[0] : event.ids;
	}
}
