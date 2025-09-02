import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Keep messages validation simple with z.any() due to complex UI message structure
export const ChatRequestSchema = z.object({
	lessonId: z.string().min(1, "Lesson ID is required"),
	messages: z.array(z.any()).min(1, "At least one message required"),
});

export const RecommendationRequestSchema = z.object({
	query: z.string().min(3, "Query must be at least 3 characters long"),
});

// Event request schemas
export const EventRequestSchema = z.object({
	eventType: z.enum(["lesson_completed", "quiz_completed", "session_started", "session_ended"]),
	contentId: z.string().optional(),
	courseId: z.string().optional(),
	timeSpent: z.number().min(0).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

export const validateChatRequest = () => zValidator("json", ChatRequestSchema);
export const validateRecommendationRequest = () =>
	zValidator("json", RecommendationRequestSchema);
export const validateEventRequest = () => zValidator("json", EventRequestSchema);
