import { RepositoryError } from "../domains/shared/errors";
import type { SanityRepository } from "../infrastructure/database/sanity.repository";
import { inngest } from "../inngest/inggest";
import type { AnalyticsService } from "./analytics.service";

export interface EventPayload {
	eventType:
		| "lesson_completed"
		| "quiz_completed"
		| "session_started"
		| "session_ended";
	contentId?: string;
	courseId?: string;
	timeSpent?: number;
	metadata?: Record<string, any>;
}

export class EventService {
	constructor(
		private sanityRepository: SanityRepository,
		private analyticsService: AnalyticsService,
	) {}

	async processEvent(
		userId: string,
		payload: EventPayload,
	): Promise<{ success: boolean; message: string }> {
		try {
			// Verify user exists
			const user = await this.sanityRepository.getUserById(userId);
			if (!user) {
				throw new RepositoryError(
					`User not found: ${userId}`,
					new Error("User not found"),
				);
			}

			switch (payload.eventType) {
				case "session_started":
					return await this.handleSessionStarted(userId, payload);

				case "lesson_completed":
					return await this.handleLessonCompleted(userId, payload);

				case "quiz_completed":
					return await this.handleQuizCompleted(userId, payload);

				case "session_ended":
					return await this.handleSessionEnded(userId, payload);

				default:
					throw new Error(`Unsupported event type: ${payload.eventType}`);
			}
		} catch (error) {
			console.error("Event processing failed:", error);
			return {
				success: false,
				message:
					error instanceof Error
						? error.message
						: "Terjadi kesalahan yang tidak diketahui",
			};
		}
	}

	private async handleSessionStarted(
		userId: string,
		payload: EventPayload,
	): Promise<{ success: boolean; message: string }> {
		// Check if there's already an active session
		const activeSession =
			await this.sanityRepository.getActiveLearningSession(userId);

		if (activeSession) {
			// End the existing session before starting a new one
			const endTime = new Date().toISOString();
			const startTime = new Date(
				activeSession.startTime || new Date().toISOString(),
			);
			const durationMinutes = Math.floor(
				(Date.now() - startTime.getTime()) / (1000 * 60),
			);

			await this.sanityRepository.updateLearningSession(activeSession._id, {
				endTime,
				durationMinutes,
			});
		}

		// Create new learning session
		await this.sanityRepository.createLearningSession(userId, payload.courseId);

		return {
			success: true,
			message: "Sesi belajar berhasil dimulai",
		};
	}

	private async handleLessonCompleted(
		userId: string,
		payload: EventPayload,
	): Promise<{ success: boolean; message: string }> {
		if (!payload.contentId) {
			throw new Error("contentId is required for lesson_completed event");
		}

		const timeSpent = payload.timeSpent || 0;

		// Get or create active session
		let activeSession =
			await this.sanityRepository.getActiveLearningSession(userId);
		if (!activeSession) {
			activeSession = await this.sanityRepository.createLearningSession(
				userId,
				payload.courseId,
			);
		}

		// Add activity to session
		await this.sanityRepository.addActivityToSession(activeSession._id, {
			type: "lesson",
			contentId: payload.contentId,
			timeSpent,
		});

		// Update user analytics (sync)
		await this.analyticsService.updateUserAnalytics(userId, {
			activityType: "lesson",
			timeSpent,
			metadata: payload.metadata,
		});

		// Trigger background analytics processing for additional insights
		await inngest.send({
			name: "analytics/process.triggered",
			data: {
				userId,
				activityType: "lesson",
				timeSpent,
				metadata: payload.metadata,
			},
		});

		// Update enrollment progress if course is specified
		// if (payload.courseId) {
		// 	await this.analyticsService.updateEnrollmentIfNeeded(
		// 		userId,
		// 		payload.courseId,
		// 		payload.contentId,
		// 		"lesson",
		// 	);
		// }

		return {
			success: true,
			message: "Penyelesaian pelajaran berhasil dicatat",
		};
	}

	private async handleQuizCompleted(
		userId: string,
		payload: EventPayload,
	): Promise<{ success: boolean; message: string }> {
		if (!payload.contentId) {
			throw new Error("contentId is required for quiz_completed event");
		}

		const timeSpent = payload.timeSpent || 0;

		// Get or create active session
		let activeSession =
			await this.sanityRepository.getActiveLearningSession(userId);
		if (!activeSession) {
			activeSession = await this.sanityRepository.createLearningSession(
				userId,
				payload.courseId,
			);
		}

		// Add activity to session
		await this.sanityRepository.addActivityToSession(activeSession._id, {
			type: "quiz",
			contentId: payload.contentId,
			timeSpent,
		});

		// Get quiz performance data
		let quizMetadata = payload.metadata || {};
		if (!quizMetadata.percentage) {
			// Try to fetch the latest quiz attempt for more accurate data
			const latestAttempt = await this.sanityRepository.getLatestQuizAttempt(
				userId,
				payload.contentId,
			);
			if (latestAttempt) {
				quizMetadata = {
					...quizMetadata,
					percentage: latestAttempt.percentage,
					score: latestAttempt.score,
					correctCount: latestAttempt.correctCount,
					totalQuestions: latestAttempt.totalQuestions,
				};
			}
		}

		// Update user analytics with quiz performance (sync)
		await this.analyticsService.updateUserAnalytics(userId, {
			activityType: "quiz",
			timeSpent,
			metadata: quizMetadata,
		});

		// Trigger background analytics processing for additional insights
		await inngest.send({
			name: "analytics/process.triggered",
			data: {
				userId,
				activityType: "quiz",
				timeSpent,
				metadata: quizMetadata,
			},
		});

		// // // Update enrollment progress if course is specified
		// // if (payload.courseId) {
		// // 	await this.analyticsService.updateEnrollmentIfNeeded(
		// // 		userId,
		// // 		payload.courseId,
		// // 		payload.contentId,
		// // 		"quiz",
		// // 	);
		// }

		return {
			success: true,
			message: "Penyelesaian kuis berhasil dicatat",
		};
	}

	private async handleSessionEnded(
		userId: string,
		payload: EventPayload,
	): Promise<{ success: boolean; message: string }> {
		// Get active session
		const activeSession =
			await this.sanityRepository.getActiveLearningSession(userId);

		if (!activeSession) {
			return {
				success: true,
				message: "Tidak ada sesi aktif untuk diakhiri",
			};
		}

		// Calculate session duration
		const endTime = new Date().toISOString();
		const startTime = new Date(
			activeSession.startTime || new Date().toISOString(),
		);
		const durationMinutes = Math.floor(
			(Date.now() - startTime.getTime()) / (1000 * 60),
		);

		// Update session with end time and duration
		await this.sanityRepository.updateLearningSession(activeSession._id, {
			endTime,
			durationMinutes,
		});

		return {
			success: true,
			message: "Sesi belajar berhasil diakhiri",
		};
	}
}
