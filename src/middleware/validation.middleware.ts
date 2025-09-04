import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Keep messages validation simple with z.any() due to complex UI message structure
export const ChatRequestSchema = z.object({
	lessonId: z.string().min(1, "ID pelajaran harus diisi"),
	messages: z.array(z.any()).min(1, "Minimal satu pesan diperlukan"),
});

export const RecommendationRequestSchema = z.object({
	query: z.string().min(3, "Pertanyaan harus minimal 3 karakter"),
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
