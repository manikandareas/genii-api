import type { SanityClient } from "@sanity/client";
import type { UIMessage } from "ai";
import type { ChatSession, Lesson, User } from "../../../sanity.types";
import { RepositoryError } from "../../domains/shared/errors";
import type {
	ChatMessageRepository,
	ChatSessionRepository,
	LessonRepository,
	MessageMetadata,
	UserRepository,
} from "../../domains/shared/types";
import { fromUIMessage } from "../../utils/message.utils";
import {
	getActiveSessionQuery,
	getChatHistoryQuery,
	getLessonByIdQuery,
	getLessonTitleQuery,
	getUserByClerkIdQuery,
	getUserByIdQuery,
	getUserLevelQuery,
} from "./sanity.queries";

export class SanityRepository
	implements
		UserRepository,
		LessonRepository,
		ChatSessionRepository,
		ChatMessageRepository
{
	constructor(private client: SanityClient) {}

	async getUserByClerkId(clerkId: string): Promise<User | null> {
		try {
			const user = await this.client.fetch(getUserByClerkIdQuery, { clerkId });
			return user || null;
		} catch (error) {
			throw new RepositoryError(
				`Failed to fetch user by Clerk ID: ${clerkId}`,
				error as Error,
			);
		}
	}

	async getUserById(userId: string): Promise<User | null> {
		try {
			const user = await this.client.fetch(getUserByIdQuery, { userId });
			return user || null;
		} catch (error) {
			throw new RepositoryError(
				`Failed to fetch user by ID: ${userId}`,
				error as Error,
			);
		}
	}

	async getLessonById(lessonId: string): Promise<Lesson | null> {
		try {
			const lesson = await this.client.fetch(getLessonByIdQuery, { lessonId });
			return lesson || null;
		} catch (error) {
			throw new RepositoryError(
				`Failed to fetch lesson by ID: ${lessonId}`,
				error as Error,
			);
		}
	}

	async getActiveSession(
		userId: string,
		lessonId: string,
	): Promise<ChatSession | null> {
		try {
			const session = await this.client.fetch(getActiveSessionQuery, {
				userId,
				lessonId,
			});
			return session || null;
		} catch (error) {
			throw new RepositoryError(
				`Failed to fetch active session for user ${userId} and lesson ${lessonId}`,
				error as Error,
			);
		}
	}

	async createSession(userId: string, lessonId: string): Promise<ChatSession> {
		try {
			// Get user and lesson data for metadata
			const [user, lesson] = await Promise.all([
				this.client.fetch(getUserLevelQuery, { userId }),
				this.client.fetch(getLessonTitleQuery, { lessonId }),
			]);

			const sessionDoc = {
				_type: "chatSession",
				users: [
					{ _ref: userId, _type: "reference", _key: crypto.randomUUID() },
				],
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
			};

			return (await this.client.create(sessionDoc)) as ChatSession;
		} catch (error) {
			throw new RepositoryError(
				`Failed to create session for user ${userId} and lesson ${lessonId}`,
				error as Error,
			);
		}
	}

	async updateLastActivity(sessionId: string): Promise<void> {
		try {
			await this.client
				.patch(sessionId)
				.set({ lastActivity: new Date().toISOString() })
				.commit();
		} catch (error) {
			throw new RepositoryError(
				`Failed to update last activity for session ${sessionId}`,
				error as Error,
			);
		}
	}

	async saveMessage(
		session: ChatSession,
		message: UIMessage,
		metadata?: MessageMetadata,
	): Promise<void> {
		try {
			const sanityDoc = fromUIMessage(message, session._id);

			const messageDoc = {
				_type: "chatMessage",
				messageId: message.id,
				session: {
					_ref: session._id,
					_type: "reference",
				},
				role: message.role,
				parts: sanityDoc.parts,
				metadata: metadata ? { custom: JSON.stringify(metadata) } : undefined,
			};

			await this.client.create(messageDoc);
		} catch (error) {
			throw new RepositoryError(
				`Failed to save message for session ${session._id}`,
				error as Error,
			);
		}
	}

	async getChatHistory(userId: string, lessonId: string): Promise<UIMessage[]> {
		try {
			const messages = await this.client.fetch(getChatHistoryQuery, {
				userId,
				lessonId,
			});

			return messages.map((msg: any) => ({
				id: msg._id,
				role: msg.role,
				parts: [{ type: "text", text: msg.content || "", state: "done" }],
				metadata: msg.timestamp
					? { createdAt: new Date(msg.timestamp) }
					: undefined,
			}));
		} catch (error) {
			throw new RepositoryError(
				`Failed to fetch chat history for user ${userId} and lesson ${lessonId}`,
				error as Error,
			);
		}
	}

	// User management methods
	async createUser(userData: {
		clerkId: string;
		email: string;
		firstname: string;
		lastname: string;
		username: string;
		onboardingStatus: "not_started" | "completed";
		level: "beginner" | "intermediate" | "advanced";
	}): Promise<User> {
		try {
			const userDoc = {
				_type: "user",
				clerkId: userData.clerkId,
				email: userData.email,
				firstname: userData.firstname,
				lastname: userData.lastname,
				username: userData.username,
				onboardingStatus: userData.onboardingStatus,
				level: userData.level,
				studyStreak: 0,
				analytics: {
					totalXP: 0,
					coursesCompleted: 0,
					lessonsCompleted: 0,
					averageSessionTime: 0,
					streakDays: 0,
				},
			};

			return (await this.client.create(userDoc)) as User;
		} catch (error) {
			throw new RepositoryError(
				`Failed to create user with Clerk ID: ${userData.clerkId}`,
				error as Error,
			);
		}
	}

	async updateUser(userId: string, updates: {
		email?: string | null;
		firstname?: string | null;
		lastname?: string | null;
		username?: string | null;
	}): Promise<void> {
		try {
			// Filter out null values and only update non-null fields
			const cleanUpdates: Record<string, string> = {};
			Object.entries(updates).forEach(([key, value]) => {
				if (value !== null && value !== undefined) {
					cleanUpdates[key] = value;
				}
			});

			if (Object.keys(cleanUpdates).length > 0) {
				await this.client.patch(userId).set(cleanUpdates).commit();
			}
		} catch (error) {
			throw new RepositoryError(
				`Failed to update user: ${userId}`,
				error as Error,
			);
		}
	}

	async anonymizeUser(userId: string): Promise<void> {
		try {
			await this.client
				.patch(userId)
				.set({
					email: "deleted@example.com",
					firstname: "Deleted",
					lastname: "User",
					username: `deleted_user_${Date.now()}`,
					clerkId: null,
				})
				.commit();
		} catch (error) {
			throw new RepositoryError(
				`Failed to anonymize user: ${userId}`,
				error as Error,
			);
		}
	}

	// Recommendation-specific methods
	async getCoursesByIds(ids: string[]) {
		try {
			const query = `*[_type == "course" && _id in $ids]`;
			return await this.client.fetch(query, { ids });
		} catch (error) {
			throw new RepositoryError(
				"Failed to fetch courses by IDs",
				error as Error,
			);
		}
	}

	async upsertRecommendation(recommendation: RecommendationInput) {
		try {
			const existingQuery = `*[_type == "recommendation" && createdFor._ref == $userId][0]`;
			const existingRecommendation = await this.client.fetch(existingQuery, {
				userId: recommendation.createdFor,
			});

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
				await this.client.patch(existingRecommendation._id).set(doc).commit();
				return existingRecommendation._id;
			} else {
				const result = await this.client.create(doc);
				return result._id;
			}
		} catch (error) {
			throw new RepositoryError(
				"Failed to save recommendation",
				error as Error,
			);
		}
	}

	async updateRecommendationStatus(
		recommendationId: string,
		status: "in_progress" | "completed" | "failed",
		message?: string,
		additionalFields?: Partial<RecommendationInput>,
	) {
		try {
			const updateFields: Record<string, unknown> = {
				status,
				...(message && { message }),
				...additionalFields,
			};

			// Normalize courses to reference objects if provided as string IDs
			if (additionalFields && Array.isArray(additionalFields.courses)) {
				const courses = additionalFields.courses as string[];
				const refs = courses.map((courseId) => ({
					_ref: courseId,
					_type: "reference",
					_key: crypto.randomUUID(),
				}));
				updateFields.courses = refs;
			}

			await this.client.patch(recommendationId).set(updateFields).commit();
			return recommendationId;
		} catch (error) {
			throw new RepositoryError(
				`Failed to update recommendation status for ${recommendationId}`,
				error as Error,
			);
		}
	}
}

// Type definition for recommendation input
interface RecommendationInput {
	query: string;
	reason?: string;
	createdFor: string; // User ID
	courses: string[]; // Course IDs
	status?: "in_progress" | "completed" | "failed";
	message?: string;
}
