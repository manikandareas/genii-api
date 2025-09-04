import { Inngest } from "inngest";
import { analyticsService, recommendationService, emailService, sanityRepository } from "../infrastructure/container";
import { userSyncFunctions } from "./user-sync";

export const inngest = new Inngest({
	id: "api-genii",
});

const recommendationFn = inngest.createFunction(
	{ id: "course-recommendation" },
	{ event: "course/recommendation.triggered" },
	async ({ event, step }) => {
		const { query, userId } = event.data;

		// Process recommendations using our new service
		await step.run("process-recommendations", async () => {
			await recommendationService.processRecommendations({ query, userId });
		});
	},
);

const analyticsProcessingFn = inngest.createFunction(
	{ id: "analytics-processing" },
	{ event: "analytics/process.triggered" },
	async ({ event, step }) => {
		const { userId, activityType, timeSpent, metadata } = event.data;

		// Get user data before updating analytics for comparison
		const userBefore = await step.run("get-user-before-update", async () => {
			return await sanityRepository.getUserById(userId);
		});

		// Process analytics updates in background
		await step.run("update-user-analytics", async () => {
			await analyticsService.updateUserAnalytics(userId, {
				activityType,
				timeSpent,
				metadata,
			});
		});

		// Check for achievements and send emails
		await step.run("check-achievements-and-notify", async () => {
			const userAfter = await sanityRepository.getUserById(userId);
			if (!userBefore || !userAfter) return;

			// Check for level up
			if (userAfter.analytics?.currentLevel && userBefore.analytics?.currentLevel) {
				if (userAfter.analytics.currentLevel > userBefore.analytics.currentLevel) {
					await emailService.sendAchievementEmail(userId, {
						type: "level_up",
						details: `Congratulations! You've reached Level ${userAfter.analytics.currentLevel}`,
						value: userAfter.analytics.currentLevel,
					});
				}
			}

			// Check for streak milestones
			if (userAfter.studyStreak && userBefore.studyStreak !== undefined) {
				const newStreak = userAfter.studyStreak;
				const oldStreak = userBefore.studyStreak;
				
				// Check for streak milestones (7, 30, 100 days)
				const milestones = [7, 30, 100];
				for (const milestone of milestones) {
					if (newStreak >= milestone && oldStreak < milestone) {
						await emailService.sendAchievementEmail(userId, {
							type: "streak",
							details: `Amazing! You've maintained a ${milestone}-day learning streak`,
							value: milestone,
						});
						break; // Only send one milestone email per update
					}
				}
			}

			// Check for course completion (if activityType indicates course completion)
			if (activityType === "lesson" && metadata?.courseCompleted) {
				await emailService.sendCourseCompletionEmail(userId, {
					title: metadata.courseTitle || "Course",
					difficulty: metadata.difficulty || "beginner",
					completionTime: timeSpent,
				});
			}
		});
	},
);

const weeklyDigestFn = inngest.createFunction(
	{ id: "weekly-digest" },
	{ cron: "0 9 * * 1" }, // Every Monday at 9 AM
	async ({ step }) => {
		// Get all users who have email preferences enabled for weekly digest
		await step.run("send-weekly-digests", async () => {
			const users = await sanityRepository.getUsersForWeeklyDigest();

			const oneWeekAgo = new Date();
			oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

			const emailPromises = users.map(async (user) => {
				try {
					// Get user's weekly activity
					const weeklyActivity = await sanityRepository.getWeeklyUserActivity(
						user._id,
						oneWeekAgo
					);

					// Only send digest if user has some activity
					if (weeklyActivity.lessonsCompleted > 0 || weeklyActivity.timeSpent > 0) {
						await emailService.sendWeeklyDigest(user._id, weeklyActivity);
					}
				} catch (error) {
					console.error(`Failed to send weekly digest to user ${user._id}:`, error);
				}
			});

			await Promise.allSettled(emailPromises);
		});
	},
);

export const functions = [recommendationFn, analyticsProcessingFn, weeklyDigestFn, ...userSyncFunctions];
