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
	eventService,
	recommendationService,
	sanityRepository,
} from "./infrastructure/container";
import { functions, inngest } from "./inngest/inggest";
import { errorHandler } from "./middleware/error.middleware";
import {
	validateChatRequest,
	validateEventRequest,
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
		// Get the request body as text for verification
		const body = c.req.raw;
		// Verify the webhook using Clerk's verifyWebhook
		const event = await verifyWebhook(body);

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

// Events endpoint for user activity tracking
app.post("/api/events", validateEventRequest(), async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	const eventPayload = c.req.valid("json");

	// Get user to verify existence and get internal user ID
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	// Process the event
	const result = await eventService.processEvent(user._id, eventPayload);

	const response: ApiResponse = {
		success: result.success,
		data: result.success ? { message: result.message } : null,
		...(result.success ? {} : { 
			error: { 
				code: "EVENT_PROCESSING_FAILED", 
				message: result.message 
			}
		}),
	};

	return c.json(response, result.success ? 200 : 400);
});

// Email preferences endpoints
app.get("/api/email-preferences", async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	// Get user to verify existence and get preferences
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	const response: ApiResponse = {
		success: true,
		data: {
			preferences: user.emailPreferences || {
				welcomeEmail: true,
				achievementEmails: true,
				courseCompletionEmails: true,
				weeklyDigest: true,
			},
			stats: user.emailStats || {
				totalSent: 0,
				totalOpened: 0,
			}
		},
	};

	return c.json(response, 200);
});

app.patch("/api/email-preferences", async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	// Get user to verify existence
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	const body = await c.req.json();
	const { preferences } = body;

	// Validate preferences object
	if (!preferences || typeof preferences !== 'object') {
		return c.json({ error: "Invalid preferences object" }, 400);
	}

	// Update user email preferences
	await sanityRepository.updateUserEmailPreferences(user._id, preferences);

	const response: ApiResponse = {
		success: true,
		data: { message: "Email preferences updated successfully" },
	};

	return c.json(response, 200);
});

app.post("/api/email-preferences/unsubscribe", async (c) => {
	const auth = getAuth(c);
	if (!auth?.userId) {
		throw new NotFoundError("User");
	}

	// Get user to verify existence
	const user = await sanityRepository.getUserByClerkId(auth.userId);
	if (!user) {
		throw new NotFoundError("User", auth.userId);
	}

	// Unsubscribe from all emails
	await sanityRepository.updateUserEmailPreferences(user._id, {
		welcomeEmail: false,
		achievementEmails: false,
		courseCompletionEmails: false,
		weeklyDigest: false,
		unsubscribedAt: new Date().toISOString(),
	});

	const response: ApiResponse = {
		success: true,
		data: { message: "Successfully unsubscribed from all emails" },
	};

	return c.json(response, 200);
});

// Email tracking endpoint (for Resend webhooks)
app.post("/api/webhooks/email", async (c) => {
	try {
		const body = await c.req.json();
		const { type, data } = body;

		// Handle different email events from Resend
		switch (type) {
			case "email.delivered":
			case "email.opened":
				if (data.tags?.userId) {
					const status = type === "email.delivered" ? "delivered" : "opened";
					
					// Update email notification status if we have the notification ID
					if (data.tags?.notificationId) {
						await sanityRepository.updateEmailNotificationStatus(
							data.tags.notificationId,
							status as "delivered" | "opened"
						);
					}

					// Update user email stats
					await sanityRepository.updateUserEmailStats(data.tags.userId, {
						...(status === "opened" && {
							incrementOpened: true,
							lastOpenedAt: new Date().toISOString(),
						}),
					});
				}
				break;

			case "email.bounced":
			case "email.complained":
				// Handle bounces and complaints by updating notification status
				if (data.tags?.notificationId) {
					await sanityRepository.updateEmailNotificationStatus(
						data.tags.notificationId,
						"failed"
					);
				}
				break;

			default:
				console.log(`Unhandled email webhook event type: ${type}`);
		}

		return c.json({ received: true });
	} catch (error) {
		console.error("Email webhook processing failed:", error);
		return c.json({ error: "Webhook processing failed" }, 400);
	}
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
