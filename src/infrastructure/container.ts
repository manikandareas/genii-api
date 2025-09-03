import { ChatService } from "../domains/chat/chat.service";
import { RecommendationService } from "../domains/recommendations/recommendation.service";
import { inngest } from "../inngest/inggest";
import { sanityClient } from "../lib/sanity";
import { resourceStoreIndex, vectorIndex } from "../lib/upstash";
import { AnalyticsService } from "../services/analytics.service";
import { EventService } from "../services/event.service";
import { OpenAIService } from "./ai/ai.service";
import { UpstashVectorService } from "./ai/vector.service";
// Import our new services
import { SanityRepository } from "./database/sanity.repository";
import { InngestJobService } from "./jobs/inngest.service";

class Container {
	private static instance: Container;
	private services = new Map<string, any>();

	private constructor() {
		this.initializeServices();
	}

	public static getInstance(): Container {
		if (!Container.instance) {
			Container.instance = new Container();
		}
		return Container.instance;
	}

	private initializeServices(): void {
		// Infrastructure services
		const sanityRepository = new SanityRepository(sanityClient);
		const vectorService = new UpstashVectorService(
			vectorIndex,
			resourceStoreIndex,
		);
		const aiService = new OpenAIService(sanityRepository, vectorService);
		const jobService = new InngestJobService(inngest);

		// Domain services
		const chatService = new ChatService(
			sanityRepository, // UserRepository
			sanityRepository, // LessonRepository
			sanityRepository, // ChatSessionRepository
			sanityRepository, // ChatMessageRepository
			aiService,
			vectorService,
		);

		const recommendationService = new RecommendationService(
			vectorService,
			sanityRepository,
			jobService,
		);

		// Analytics and event services
		const analyticsService = new AnalyticsService(sanityRepository);
		const eventService = new EventService(sanityRepository, analyticsService);

		// Register services
		this.services.set("sanityRepository", sanityRepository);
		this.services.set("aiService", aiService);
		this.services.set("vectorService", vectorService);
		this.services.set("jobService", jobService);
		this.services.set("chatService", chatService);
		this.services.set("recommendationService", recommendationService);
		this.services.set("analyticsService", analyticsService);
		this.services.set("eventService", eventService);
	}

	public get<T>(serviceName: string): T {
		const service = this.services.get(serviceName);
		if (!service) {
			throw new Error(`Service ${serviceName} not found in container`);
		}
		return service;
	}
}

// Export configured services for use in routes
const container = Container.getInstance();

export const sanityRepository =
	container.get<SanityRepository>("sanityRepository");
export const aiService = container.get<OpenAIService>("aiService");
export const vectorService =
	container.get<UpstashVectorService>("vectorService");
export const jobService = container.get<InngestJobService>("jobService");
export const chatService = container.get<ChatService>("chatService");
export const recommendationService = container.get<RecommendationService>(
	"recommendationService",
);
export const analyticsService =
	container.get<AnalyticsService>("analyticsService");
export const eventService = container.get<EventService>("eventService");
