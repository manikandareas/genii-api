import { verifyWebhook } from "@clerk/backend/webhooks";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "inngest/hono";
import { NotFoundError } from "./domains/shared/errors";
import type { ApiResponse } from "./domains/shared/types";
// Import our new services and middleware
import {
	chatService,
	recommendationService,
	sanityRepository,
} from "./infrastructure/container";
import { functions, inngest } from "./inngest/inggest";
import { errorHandler } from "./middleware/error.middleware";
import {
	validateChatRequest,
	validateRecommendationRequest,
} from "./middleware/validation.middleware";

const app = new Hono();

// Global middleware
app.use(errorHandler());

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

// Inngest webhook endpoint
app.on(
	["GET", "PUT", "POST"],
	"/api/inngest",
	serve({
		client: inngest,
		functions,
	}),
);

// Clerk webhook endpoint
app.post("/api/webhooks/clerk", async (c) => {
	const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
	if (!webhookSecret) {
		return c.json({ error: "Webhook secret not configured" }, 500);
	}

	try {
		// Get the headers and body for verification
		const headers = Object.fromEntries(
			Object.entries(c.req.raw.headers).map(([key, value]) => [
				key,
				Array.isArray(value) ? value[0] : value,
			]),
		);
		const body = await c.req.json();

		// Verify the webhook using Clerk's verifyWebhook
		const event = await verifyWebhook(body, headers);

		// Handle different event types and trigger Inngest functions
		switch (event.type) {
			case "user.created":
				await inngest.send({
					name: "clerk/user.created",
					data: event,
				});
				console.log("Triggered user.created sync function");
				break;

			case "user.updated":
				await inngest.send({
					name: "clerk/user.updated",
					data: event,
				});
				console.log("Triggered user.updated sync function");
				break;

			case "user.deleted":
				await inngest.send({
					name: "clerk/user.deleted",
					data: event,
				});
				console.log("Triggered user.deleted sync function");
				break;

			default:
				console.log(`Unhandled webhook event type: ${event.type}`);
		}

		return c.json({ received: true });
	} catch (error) {
		console.error("Webhook verification failed:", error);
		return c.json({ error: "Webhook verification failed" }, 400);
	}
});

// Recommendations endpoint
app.post("/api/recommendations", validateRecommendationRequest(), async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	const { query } = c.req.valid("json");

	// Get user to verify existence and get internal user ID
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	// Process recommendation request
	const result = await recommendationService.requestRecommendations({
		query,
		userId: user._id,
	});

	const response: ApiResponse = {
		success: true,
		data: result,
	};

	return c.json(response, 200);
});

// Chat endpoint
app.post("/api/chat", validateChatRequest(), async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	const { lessonId, messages } = c.req.valid("json") as {
		lessonId: string;
		messages: UIMessage[];
	};

	// Get user to verify existence
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	// Process the chat message and get the response
	const response = await chatService.processMessage({
		user,
		lessonId,
		messages,
	});

	// Return the response directly (already a proper Response object)
	return response;
});

export default {
	port: Number(process.env.PORT) || 4000,
	fetch: app.fetch,
};
