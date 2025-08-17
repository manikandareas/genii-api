import type { UIMessage } from "ai";
import { defineQuery } from "groq";
import { sanityClient } from "../lib/sanity";

export const getCoursesByIds = async (ids: string[]) => {
	const getCoursesByIdsQuery = defineQuery(
		`*[_type == "course" && _id in $ids]`,
	);
	try {
		return await sanityClient.fetch(getCoursesByIdsQuery, { ids });
	} catch (error) {
		throw new Error(
			`Failed to fetch courses by IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export const upsertRecommendation = async (
	recommendation: RecommendationInput,
) => {
	try {
		// Check if recommendation already exists for this user
		const existingRecommendation = await sanityClient.fetch(
			`*[_type == "recommendation" && createdFor._ref == $userId][0]`,
			{ userId: recommendation.createdFor },
		);

		const doc = {
			_type: "recommendation",
			query: recommendation.query,
			reason: recommendation.reason,
			createdFor: {
				_ref: recommendation.createdFor,
				_type: "reference",
			},
			courses: recommendation.courses.map((courseId) => ({
				_ref: courseId,
				_type: "reference",
			})),
		};

		if (existingRecommendation) {
			// Update existing recommendation
			await sanityClient.patch(existingRecommendation._id).set(doc).commit();
		} else {
			// Create new recommendation
			await sanityClient.create(doc);
		}
	} catch (error) {
		throw new Error(
			`Failed to save recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

// Type definition for recommendation input
interface RecommendationInput {
	query: string;
	reason?: string;
	createdFor: string; // User ID
	courses: string[]; // Course IDs
}

export const getUserByClerkId = async (clerkId: string) => {
	const getUserByClerkIdQuery = defineQuery(
		`*[_type == "user" && clerkId == $clerkId][0]`,
	);
	try {
		return await sanityClient.fetch(getUserByClerkIdQuery, { clerkId });
	} catch (error) {
		throw new Error(
			`Failed to fetch user by Clerk ID: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export const getLesson = async (lessonId: string) => {
	const getLessonQuery = defineQuery(
		`*[_type == "lesson" && _id == $lessonId][0]`,
	);
	try {
		return await sanityClient.fetch(getLessonQuery, { lessonId });
	} catch (error) {
		throw new Error(
			`Failed to fetch lesson by ID: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export async function saveChatMessage(
	userId: string,
	lessonId: string,
	messages: UIMessage[],
	assistantResponse: string,
	metadata: {
		model: string;
		tokens: number;
		processingTime: number;
	},
): Promise<void> {
	// Implementation untuk save ke Sanity
	const lastUserMessage = messages[messages.length - 1];

	// Create or get session - Fixed query to match schema
	let session = await sanityClient.fetch(
		`*[_type == "chatSession" && $userId in users[]._ref && $lessonId in lessons[]._ref && status == "active"][0]`,
		{ userId, lessonId },
	);

	if (!session) {
		session = await sanityClient.create({
			_type: "chatSession",
			users: [{ _ref: userId }], // Array of references
			lessons: [{ _ref: lessonId }], // Array of references
			sessionId: `${userId}-${lessonId}-${Date.now()}`,
			createdAt: new Date().toISOString(),
			lastActivity: new Date().toISOString(),
			status: "active", // Required field with specific values
			metadata: {
				userLevel: "intermediate", // Get from user
				lessonTitle: "Current Lesson", // Get from lesson
				totalMessages: 0,
			},
		});
	}

	// Save assistant message - Fixed to use sessions array
	await sanityClient.create({
		_type: "chatMessage",
		sessions: [{ _ref: session._id }], // Array of references
		role: "assistant",
		content: assistantResponse,
		timestamp: new Date().toISOString(),
		status: "completed",
		metadata: {
			model: metadata.model,
			tokens: metadata.tokens,
			processingTime: metadata.processingTime,
		},
	});

	// Save user message - Fixed to use sessions array
	if (lastUserMessage.role === "user") {
		await sanityClient.create({
			_type: "chatMessage",
			sessions: [{ _ref: session._id }], // Array of references
			role: "user",
			content:
				lastUserMessage.parts[0].type === "text"
					? lastUserMessage.parts[0].text
					: "",
			timestamp: new Date().toISOString(),
			status: "completed",
			metadata: {
				model: metadata.model,
				tokens: metadata.tokens,
				processingTime: metadata.processingTime,
			},
		});
	}
}
