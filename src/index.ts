import { openai } from "@ai-sdk/openai";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "inngest/hono";
import { z } from "zod";
import type { ChatSession } from "../sanity.types";
import { functions, inngest } from "./inngest/inggest";
import { vectorIndex } from "./lib/upstash";
import {
	getLesson,
	getOrCreateChatSession,
	getUserByClerkId,
	saveChatMessage,
} from "./sanity";
import { buildSystemPrompt, type VectorMetadata } from "./utils";

const app = new Hono();

export const availableModel = {
	main: openai("gpt-5-mini"),
	chat: openai("gpt-4.1-mini"),
};

app.on(
	["GET", "PUT", "POST"],
	"/api/inngest",
	serve({
		client: inngest,
		functions,
	}),
);

app.use(
	cors({
		origin: "*",
	}),
);

app.use(
	"*",
	clerkMiddleware({
		secretKey: process.env.CLERK_SECRET_KEY,
		publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
	}),
);

app.post(
	"/api/recommendations",
	zValidator(
		"json",
		z.object({
			query: z.string().min(3, "Query must be at least 3 characters long"),
		}),
	),
	async (c) => {
		const { query } = c.req.valid("json");
		console.log("Processing recommendation for query:", query);

		const auth = getAuth(c);

		console.log("Auth:", auth);

		if (!auth?.userId) {
			return c.json({
				message: "You are not logged in.",
			});
		}

		const user = await getUserByClerkId(auth.userId);

		if (!user) {
			return c.json({
				message: "You are not logged in.",
			});
		}

		console.log("User:", user);

		await inngest.send({
			name: "course/recommendation.triggered",
			data: {
				query,
				userId: user._id,
			},
		});

		console.log("Recommendation triggered");

		return c.json(
			{
				status: "processing",
				message: "Recommendations are being processed",
			},
			200,
		);
	},
);

app.post(
	"/api/chat",
	zValidator(
		"json",
		z.object({ lessonId: z.string(), messages: z.array(z.any()) }),
	),
	async (c) => {
		const { lessonId, messages } = c.req.valid("json");

		console.log("=====Request in+++++");
		try {
			const auth = getAuth(c);

			console.log("Auth-1:", auth);
			if (!auth?.userId) {
				return c.json({
					message: "You are not logged in.",
				});
			}

			console.log("Auth:", auth);

			const [user, lesson] = await Promise.all([
				getUserByClerkId(auth.userId),
				getLesson(lessonId),
			]);

			if (!user) {
				return c.json({
					message: "You are not logged in.",
				});
			}

			if (!lesson) {
				return c.json({
					message: "Lesson not found.",
				});
			}
			console.log("Messages:", messages);

			const lastMessage = messages[messages.length - 1]?.parts[0].text;

			console.log("Last message:", lastMessage);

			if (!lastMessage) {
				return c.json({ error: "No message content" }, 400);
			}

			const searchResults = await vectorIndex.query<VectorMetadata>({
				data: lastMessage,
				topK: 3,
				includeMetadata: true,
				includeVectors: false,
				filter: `type = 'lesson' AND id = '${lessonId}'`,
			});

			// 4. Build context prompt
			const systemPrompt = buildSystemPrompt(user, lesson, searchResults);

			const startProcessingTime = Date.now();

			console.log("Search results:", searchResults);
			console.log("System Prompt:", systemPrompt);

			// Create or get session first
			const session = await getOrCreateChatSession(user._id, lessonId);

			// Save user message before processing
			const userMessage = messages[messages.length - 1];
			if (userMessage && userMessage.role === "user") {
				await saveChatMessage(session as ChatSession, userMessage);
			}

			return streamText({
				model: availableModel.chat,
				system: systemPrompt,
				messages: convertToModelMessages(messages),
				onFinish: async (result) => {
					// Create assistant message and save to Sanity
					const assistantMessage: UIMessage = {
						id: crypto.randomUUID(),
						role: "assistant",
						parts: [
							{
								type: "text",
								text: result.text,
								state: "done",
							},
						],
						metadata: {
							model: result.response.modelId,
							tokens: result.usage.totalTokens || 0,
							processingTime: Date.now() - startProcessingTime,
						},
					};
					
					await saveChatMessage(session as ChatSession, assistantMessage, {
						model: result.response.modelId,
						tokens: result.usage.totalTokens || 0,
						processingTime: Date.now() - startProcessingTime,
					});
				},
			}).toUIMessageStreamResponse();
		} catch (error) {
			console.error("Error processing chat:", error);
			return c.json({ error: "Failed to process chat" }, 500);
		}
	},
);

export default {
	port: Number(process.env.PORT) || 4000,
	fetch: app.fetch,
};
