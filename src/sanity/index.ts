import type { UIMessage } from "ai";
import { defineQuery } from "groq";
import type { ChatSession } from "../../sanity.types";
import { sanityClient } from "../lib/sanity";
import { fromUIMessage } from "../utils";

export const chatMessageQuery = defineQuery(`
*[_type == "chatMessage" && _id == $messageId][0] {
  _id,
  _rev,
  _type,
  _createdAt,
  _updatedAt,
  messageId,
  session->{
    _id,
    _type,
    sessionId,
    status,
    createdAt,
    lastActivity,
    metadata
  },
  role,
  metadata {
    custom
  },
  parts[]
}`);

// Individual query exports for Sanity typegen
export const getActiveSessionQuery = defineQuery(
	`*[_type == "chatSession" && 
		  references($userId) && 
		  references($lessonId) && 
		  status == "active"][0]`,
);

export const getUserByIdQuery = defineQuery(
	`*[_type == "user" && _id == $userId][0]`,
);

export const getUserByClerkIdQuery = defineQuery(
	`*[_type == "user" && clerkId == $clerkId][0]`,
);

export const getLessonByIdQuery = defineQuery(
	`*[_type == "lesson" && _id == $lessonId][0]`,
);

export const getUserLevelQuery = defineQuery(
	`*[_type == "user" && _id == $userId][0]{level}`,
);

export const getLessonTitleQuery = defineQuery(
	`*[_type == "lesson" && _id == $lessonId][0]{title}`,
);

export const getCoursesByIdsQuery = defineQuery(
	`*[_type == "course" && _id in $ids]`,
);

export const getExistingRecommendationQuery = defineQuery(
	`*[_type == "recommendation" && createdFor._ref == $userId][0]`,
);

export const getChatHistoryQuery = defineQuery(
	`*[_type == "chatMessage" && 
	  references(*[_type == "chatSession" && 
	    references($userId) && 
	    references($lessonId) && 
	    status == "active"]._id)
	] | order(timestamp asc) {
	  _id,
	  role,
	  content,
	  timestamp,
	  status
	}`,
);

export const getCoursesByIds = async (ids: string[]) => {
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
			getExistingRecommendationQuery,
			{ userId: recommendation.createdFor },
		);

		const doc = {
			_type: "recommendation",
			query: recommendation.query,
			reason: recommendation.reason,
			createdFor: {
				_ref: recommendation.createdFor,
				_type: "reference",
				_key: crypto.randomUUID(),
			},
			courses: recommendation.courses.map((courseId) => ({
				_ref: courseId,
				_type: "reference",
				_key: crypto.randomUUID(),
			})),
			status: recommendation.status || "completed",
			message: recommendation.message,
		};

		if (existingRecommendation) {
			// Update existing recommendation
			await sanityClient.patch(existingRecommendation._id).set(doc).commit();
			return existingRecommendation._id;
		} else {
			// Create new recommendation
			const result = await sanityClient.create(doc);
			return result._id;
		}
	} catch (error) {
		throw new Error(
			`Failed to save recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export const updateRecommendationStatus = async (
	recommendationId: string,
	status: "in_progress" | "completed" | "failed",
	message?: string,
	additionalFields?: Partial<RecommendationInput>,
) => {
	try {
		// Build base update fields
		const updateFields: Record<string, unknown> = {
			status,
			...(message && { message }),
			...additionalFields,
		};

		// Normalize courses to reference objects if provided as string IDs
		if (additionalFields && Array.isArray(additionalFields.courses)) {
			const arr = additionalFields.courses as (string | SanityReference)[];
			const refs = arr
				.map((item) => {
					if (typeof item === "string") {
						return {
							_ref: item,
							_type: "reference",
							_key: crypto.randomUUID(),
						} as SanityReference;
					}
					if (item && typeof item === "object" && "_ref" in item) {
						return {
							_ref: item._ref,
							_type: "reference",
							_key: item._key || crypto.randomUUID(),
						} as SanityReference;
					}
					return null;
				})
				.filter((v): v is SanityReference => Boolean(v));
			updateFields.courses = refs;
		}

		await sanityClient.patch(recommendationId).set(updateFields).commit();
		return recommendationId;
	} catch (error) {
		throw new Error(
			`Failed to update recommendation status: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

// Type definition for recommendation input
interface RecommendationInput {
	query: string;
	reason?: string;
	createdFor: string; // User ID
	courses: string[]; // Course IDs
	status?: "in_progress" | "completed" | "failed";
	message?: string;
}

// Helper type for Sanity reference objects
type SanityReference = { _ref: string; _type: "reference"; _key?: string };

export const getUserByClerkId = async (clerkId: string) => {
	try {
		return await sanityClient.fetch(getUserByClerkIdQuery, { clerkId });
	} catch (error) {
		throw new Error(
			`Failed to fetch user by Clerk ID: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

export const getLesson = async (lessonId: string) => {
	try {
		return await sanityClient.fetch(getLessonByIdQuery, { lessonId });
	} catch (error) {
		throw new Error(
			`Failed to fetch lesson by ID: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

// Helper function to create chat message
const createChatMessage = async (
	sessionId: string,
	messageId: string,
	role: "user" | "assistant" | "system",
	parts: any[],
	metadata?: {
		model?: string;
		tokens?: number;
		processingTime?: number;
		[key: string]: any;
	},
) => {
	return await sanityClient.create({
		_type: "chatMessage",
		messageId,
		session: {
			_ref: sessionId,
			_type: "reference",
		},
		role,
		parts,
		metadata: metadata ? { custom: JSON.stringify(metadata) } : undefined,
	});
};

export async function saveChatMessage(
	session: ChatSession,
	message: UIMessage,
	metadata?: {
		model?: string;
		tokens?: number;
		processingTime?: number;
		[key: string]: any;
	},
): Promise<void> {
	// Convert UIMessage to Sanity format using utility function
	const sanityDoc = fromUIMessage(message, session._id);

	// Create the message with proper parts structure
	await createChatMessage(
		session._id,
		message.id,
		message.role,
		sanityDoc.parts,
		metadata,
	);
}

export const getOrCreateChatSession = async (
	userId: string,
	lessonId: string,
) => {
	// First, check if an active session exists
	const session = await sanityClient.fetch(getActiveSessionQuery, {
		userId,
		lessonId,
	});

	if (session) {
		// Update last activity
		await sanityClient
			.patch(session._id)
			.set({ lastActivity: new Date().toISOString() })
			.commit();
		return session;
	}
 
	// Get user and lesson data for metadata
	const [user, lesson] = await Promise.all([
		sanityClient.fetch(getUserLevelQuery, { userId }),
		sanityClient.fetch(getLessonTitleQuery, { lessonId }),
	]);

	// Create new session
	return await sanityClient.create({
		_type: "chatSession",
		users: [{ _ref: userId, _type: "reference", _key: crypto.randomUUID() }],
		lessons: [
			{ _ref: lessonId, _type: "reference", _key: crypto.randomUUID() },
		],
		sessionId: `${userId}-${lessonId}-${Date.now()}`,
		createdAt: new Date().toISOString(),
		lastActivity: new Date().toISOString(),
		status: "active",
		metadata: {
			userLevel: user?.level || "beginner",
			lessonTitle: lesson?.title || "Unknown Lesson",
			totalMessages: 0,
		},
	});
};

export const getChatHistory = async (userId: string, lessonId: string) => {
	try {
		const messages = await sanityClient.fetch(getChatHistoryQuery, {
			userId,
			lessonId,
		});

		return messages.map((msg) => {
			const createdAt = msg.timestamp ? new Date(msg.timestamp) : new Date();
			return {
				id: msg._id,
				role: msg.role,
				content: msg.content,
				createdAt,
			};
		});
	} catch (error) {
		throw new Error(
			`Failed to fetch chat history: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};
