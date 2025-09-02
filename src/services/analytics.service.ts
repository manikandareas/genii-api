import type { User } from "../../sanity.types";
import type { SanityRepository } from "../infrastructure/database/sanity.repository";

export class AnalyticsService {
	constructor(private sanityRepository: SanityRepository) {}

	async calculateXPForActivity(
		activityType: "lesson" | "quiz" | "reading",
		metadata?: any,
	): Promise<number> {
		switch (activityType) {
			case "lesson":
				return 50; // Base XP for lesson completion
			case "quiz": {
				// XP based on quiz performance
				const percentage = metadata?.percentage || 0;
				return Math.floor((percentage / 100) * 100); // 0-100 XP based on score
			}
			case "reading":
				return 25; // Base XP for reading completion
			default:
				return 0;
		}
	}

	async calculateStreak(
		userId: string,
		user: User,
	): Promise<{ streak: number; startDate: number }> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayTimestamp = today.getTime();

		const currentStreak = user.studyStreak || 0;
		const streakStartDate = user.streakStartDate || todayTimestamp;

		// Check if streak should continue (last activity was yesterday or today)
		const lastActivityDate = new Date(
			streakStartDate + (currentStreak - 1) * 24 * 60 * 60 * 1000,
		);
		lastActivityDate.setHours(0, 0, 0, 0);

		const daysSinceLastActivity = Math.floor(
			(todayTimestamp - lastActivityDate.getTime()) / (24 * 60 * 60 * 1000),
		);

		if (daysSinceLastActivity === 0) {
			// Same day, streak continues
			return { streak: currentStreak, startDate: streakStartDate };
		} else if (daysSinceLastActivity === 1) {
			// Next day, increment streak
			return { streak: currentStreak + 1, startDate: streakStartDate };
		} else {
			// Gap in days, reset streak
			return { streak: 1, startDate: todayTimestamp };
		}
	}

	async updateUserAnalytics(
		userId: string,
		activityData: {
			activityType: "lesson" | "quiz" | "reading";
			timeSpent: number;
			metadata?: any;
		},
	): Promise<void> {
		const user = await this.sanityRepository.getUserById(userId);
		if (!user) {
			throw new Error(`User not found: ${userId}`);
		}

		// Calculate XP for this activity
		const xpGained = await this.calculateXPForActivity(
			activityData.activityType,
			activityData.metadata,
		);

		// Get current analytics or initialize defaults
		const currentAnalytics = user.analytics || {
			totalXP: 0,
			currentLevel: 1,
			totalStudyTimeMinutes: 0,
			averageSessionTime: 0,
			strongestSkills: [],
			improvementAreas: [],
		};

		// Update analytics
		const newTotalXP = (currentAnalytics.totalXP || 0) + xpGained;
		const newTotalStudyTime =
			(currentAnalytics.totalStudyTimeMinutes || 0) + activityData.timeSpent;
		const newCurrentLevel = this.calculateLevel(newTotalXP);

		// Calculate average session time (simplified - could be enhanced with session tracking)
		const estimatedSessions = Math.max(1, Math.floor(newTotalStudyTime / 30)); // Assume 30min average
		const newAverageSessionTime = newTotalStudyTime / estimatedSessions;

		// Update user analytics
		await this.sanityRepository.updateUserAnalytics(userId, {
			totalXP: newTotalXP,
			currentLevel: newCurrentLevel,
			totalStudyTimeMinutes: newTotalStudyTime,
			averageSessionTime: Math.floor(newAverageSessionTime),
		});

		// Update streak
		const streakData = await this.calculateStreak(userId, user);
		await this.sanityRepository.updateUserStreak(
			userId,
			streakData.streak,
			streakData.startDate,
		);
	}

	private calculateLevel(totalXP: number): number {
		// Level formula: each level requires 100 more XP than previous
		// Level 1: 0-99 XP, Level 2: 100-299 XP, Level 3: 300-599 XP, etc.
		if (totalXP < 100) return 1;
		return Math.floor(Math.sqrt(totalXP / 100)) + 1;
	}

	async updateEnrollmentIfNeeded(
		userId: string,
		courseId: string,
		contentId: string,
		activityType: "lesson" | "quiz",
	): Promise<void> {
		if (!courseId) return;

		const enrollment = await this.sanityRepository.getUserEnrollment(
			userId,
			courseId,
		);
		if (!enrollment) return;

		// Simple progress calculation - in real app, you'd want to calculate based on course structure
		const currentPercent = enrollment.percentComplete || 0;
		const newPercent = Math.min(100, currentPercent + 10); // Increment by 10% per completion

		await this.sanityRepository.updateEnrollmentProgress(
			enrollment._id,
			contentId,
			newPercent,
		);
	}
}
