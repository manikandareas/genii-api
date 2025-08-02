import { openai } from "@ai-sdk/openai";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { convertToModelMessages, streamText } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "inngest/hono";
import { z } from "zod";
import { functions, inngest } from "./inngest/inggest";
import { vectorIndex } from "./lib/upstash";
import { getLesson, getUserByClerkId, saveChatMessage } from "./sanity";
import { buildSystemPrompt, type VectorMetadata } from "./utils";

const app = new Hono();

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

		const lesson = await getLesson(lessonId);

		if (!lesson) {
			return c.json({
				message: "Lesson not found.",
			});
		}

		console.log("Lesson:", lesson);

		const lastMessage = messages[messages.length - 1]?.content;

		if (!lastMessage) {
			return c.json({ error: "No message content" }, 400);
		}

		const searchResults = await vectorIndex.query<VectorMetadata>({
			data: lastMessage,
			topK: 3,
			includeMetadata: true,
			filter: `type == 'lesson' && id == ${lessonId}`,
		});

		// 4. Build context prompt
		const systemPrompt = buildSystemPrompt(user, lesson, searchResults);

		return streamText({
			model: openai("gpt-4o-mini"),
			system: systemPrompt,
			messages: convertToModelMessages(messages),
			onFinish: async (result) => {
				// Save to Sanity
				await saveChatMessage(user._id, lessonId, messages, result.text);
			},
		}).toTextStreamResponse();
	},
);

export default {
	port: 4000,
	fetch: app.fetch,
};
