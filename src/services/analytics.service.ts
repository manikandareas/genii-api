import type { User } from "../../sanity.types";
import type { SanityRepository } from "../infrastructure/database/sanity.repository";

export class AnalyticsService {
	constructor(private sanityRepository: SanityRepository) {}

	async calculateXPForActivity(
		activityType: "lesson" | "quiz" | "reading",
		metadata?: any,
	): Promise<number> {
		switch (activityType) {
			case "lesson": {
				let xp = 100; // Base XP for lesson completion
				
				// Time bonus: +10 XP per 10 minutes studied
				const timeSpentMinutes = metadata?.timeSpentMinutes || 0;
				const timeBonus = Math.floor(timeSpentMinutes / 10) * 10;
				xp += timeBonus;
				
				// Completion bonus
				if (metadata?.completed) {
					xp += 25;
				}
				
				return xp;
			}
			case "quiz": {
				const percentage = metadata?.percentage || 0;
				const attempts = metadata?.attempts || 1;
				
				// Performance-based XP: 50-150 based on score
				let xp = Math.floor(50 + (percentage / 100) * 100);
				
				// Perfect score bonus
				if (percentage === 100) {
					xp += 25;
				}
				
				// Attempt penalty: -10 XP for retakes (minimum 50 XP)
				if (attempts > 1) {
					xp = Math.max(50, xp - ((attempts - 1) * 10));
				}
				
				return xp;
			}
			case "reading": {
				let xp = 75; // Base XP for reading completion
				
				// Time bonus: +5 XP per 5 minutes reading
				const timeSpentMinutes = metadata?.timeSpentMinutes || 0;
				const timeBonus = Math.floor(timeSpentMinutes / 5) * 5;
				xp += timeBonus;
				
				// Comprehension bonus if followed by quiz/lesson
				if (metadata?.hasFollowUp) {
					xp += 15;
				}
				
				return xp;
			}
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
		// Tiered progression system:
		// Levels 1-5: 200 XP per level (beginner friendly)
		// Levels 6-15: 300 XP per level (intermediate)
		// Levels 16+: 400 XP per level (advanced)
		
		if (totalXP < 200) return 1;
		
		// Levels 2-5 (200-1000 XP)
		if (totalXP < 1000) {
			return Math.floor(totalXP / 200) + 1;
		}
		
		// Levels 6-15 (1000-3700 XP)
		if (totalXP < 3700) {
			return Math.floor((totalXP - 1000) / 300) + 6;
		}
		
		// Levels 16+ (3700+ XP)
		return Math.floor((totalXP - 3700) / 400) + 16;
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
