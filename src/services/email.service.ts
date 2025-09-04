import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { Resend } from "resend";
import type { User } from "../../sanity.types";
import type { SanityRepository } from "../infrastructure/database/sanity.repository";

export interface EmailContext {
	user: User;
	analytics?: {
		totalXP: number;
		currentLevel: number;
		studyStreak: number;
		completedCourses?: number;
		weeklyProgress?: {
			lessonsCompleted: number;
			timeSpent: number;
			xpGained: number;
		};
	};
	achievement?: {
		type: "streak" | "level_up" | "course_completion" | "milestone";
		details: string;
		value?: number;
	};
	courseDetails?: {
		title: string;
		difficulty: string;
		completionTime?: number;
	};
}

export class EmailService {
	private resend: Resend;
	private fromDomain: string;

	constructor(
		private sanityRepository: SanityRepository,
		resendApiKey: string,
		fromDomain: string = "geniius.space",
	) {
		this.resend = new Resend(resendApiKey);
		this.fromDomain = fromDomain;
	}

	async generateAIContent(
		emailType: "welcome" | "achievement" | "courseCompletion" | "weeklyDigest",
		context: EmailContext,
	): Promise<{ subject: string; content: string }> {
		const { user, analytics, achievement, courseDetails } = context;

		const systemPrompt = this.getSystemPrompt(emailType);
		const userPrompt = this.getUserPrompt(emailType, context);

		const result = await generateText({
			model: openai("gpt-4o-mini"),
			system: systemPrompt,
			prompt: userPrompt,
		});

		const content = result.text;

		// Extract subject line (assumes AI generates content with "Subject: ..." at the start)
		const subjectMatch = content.match(/Subject:\s*(.+)/i);
		const subject = subjectMatch
			? subjectMatch[1].trim()
			: this.getDefaultSubject(emailType, context);

		// Remove subject line from content if it was included
		const emailContent = content.replace(/Subject:\s*.+\n\n?/i, "").trim();

		return { subject, content: emailContent };
	}

	private getSystemPrompt(emailType: string): string {
		const basePrompt = `You are an AI assistant that creates engaging, personalized email content for an educational platform called Genii. 

Your emails should be:
- Warm, encouraging, and motivational
- Professional but friendly in tone
- Focused on the user's learning journey
- Include actionable next steps when appropriate
- Keep content concise and scannable

Always start your response with "Subject: [email subject line]" followed by the email content.`;

		switch (emailType) {
			case "welcome":
				return `${basePrompt}

You're creating a welcome email for new users. Focus on:
- Welcoming them to their learning journey
- Highlighting the platform's key benefits
- Encouraging them to start their first lesson
- Making them feel supported and excited`;

			case "achievement":
				return `${basePrompt}

You're creating an achievement celebration email. Focus on:
- Celebrating their specific accomplishment
- Recognizing their dedication and progress
- Encouraging continued learning
- Making them feel proud of their achievement`;

			case "courseCompletion":
				return `${basePrompt}

You're creating a course completion celebration email. Focus on:
- Congratulating them on completing the course
- Highlighting key skills they've gained
- Suggesting relevant next steps or courses
- Maintaining momentum in their learning journey`;

			case "weeklyDigest":
				return `${basePrompt}

You're creating a weekly progress digest email. Focus on:
- Summarizing their week's learning activities
- Highlighting key achievements and milestones
- Providing insights into their learning patterns
- Encouraging continued progress with specific suggestions`;

			default:
				return basePrompt;
		}
	}

	private getUserPrompt(emailType: string, context: EmailContext): string {
		const { user, analytics, achievement, courseDetails } = context;

		const userName = user.firstname || user.username || "there";
		const userLevel = user.level || "beginner";

		let prompt = `Create a ${emailType} email for ${userName} (${userLevel} level).`;

		switch (emailType) {
			case "welcome":
				prompt += ` This is their first interaction with our platform. Their learning goals: ${user.learningGoals?.join(", ") || "general programming skills"}.`;
				break;

			case "achievement":
				if (achievement) {
					prompt += ` They just achieved: ${achievement.details}`;
					if (achievement.value) {
						prompt += ` (${achievement.value})`;
					}
				}
				if (analytics) {
					prompt += ` Current stats: ${analytics.totalXP} XP, Level ${analytics.currentLevel}, ${analytics.studyStreak} day streak.`;
				}
				break;

			case "courseCompletion":
				if (courseDetails) {
					prompt += ` They just completed the course "${courseDetails.title}" (${courseDetails.difficulty} level)`;
					if (courseDetails.completionTime) {
						prompt += ` in ${courseDetails.completionTime} minutes`;
					}
				}
				if (analytics) {
					prompt += ` Current progress: ${analytics.totalXP} XP, Level ${analytics.currentLevel}.`;
				}
				break;

			case "weeklyDigest":
				if (analytics?.weeklyProgress) {
					const { lessonsCompleted, timeSpent, xpGained } =
						analytics.weeklyProgress;
					prompt += ` This week they completed ${lessonsCompleted} lessons, spent ${timeSpent} minutes learning, and gained ${xpGained} XP.`;
				}
				if (analytics) {
					prompt += ` Overall progress: ${analytics.totalXP} total XP, Level ${analytics.currentLevel}, ${analytics.studyStreak} day streak.`;
				}
				break;
		}

		return prompt;
	}

	private getDefaultSubject(emailType: string, context: EmailContext): string {
		const userName = context.user.firstname || context.user.username || "there";

		switch (emailType) {
			case "welcome":
				return `Welcome to Genii, ${userName}! Your learning journey starts here 🚀`;
			case "achievement":
				return `Amazing work, ${userName}! You've unlocked a new achievement 🎉`;
			case "courseCompletion":
				return `Congratulations ${userName}! Course completed 🎓`;
			case "weeklyDigest":
				return `Your weekly learning recap, ${userName} 📊`;
			default:
				return `Update from Genii`;
		}
	}

	async sendWelcomeEmail(userId: string): Promise<boolean> {
		const user = await this.sanityRepository.getUserById(userId);
		if (!user || !user.email) return false;

		// Check email preferences
		if (user.emailPreferences?.welcomeEmail === false) return false;

		const context: EmailContext = { user };
		const { subject, content } = await this.generateAIContent(
			"welcome",
			context,
		);

		try {
			const { data } = await this.resend.emails.send({
				from: `Genii <noreply@${this.fromDomain}>`,
				to: [user.email],
				subject,
				html: this.wrapInEmailTemplate(content, user),
				tags: [
					{ name: "type", value: "welcome" },
					{ name: "userId", value: user._id },
				],
			});

			// Track the email
			await this.trackEmailSent(
				user._id,
				"welcome",
				subject,
				content,
				data?.id,
			);

			return true;
		} catch (error) {
			console.error("Failed to send welcome email:", error);
			return false;
		}
	}

	async sendAchievementEmail(
		userId: string,
		achievement: {
			type: "streak" | "level_up" | "milestone";
			details: string;
			value?: number;
		},
	): Promise<boolean> {
		const user = await this.sanityRepository.getUserById(userId);
		if (!user || !user.email) return false;

		// Check email preferences
		if (user.emailPreferences?.achievementEmails === false) return false;

		const analytics = user.analytics
			? {
					totalXP: user.analytics.totalXP || 0,
					currentLevel: user.analytics.currentLevel || 1,
					studyStreak: user.studyStreak || 0,
				}
			: undefined;

		const context: EmailContext = { user, analytics, achievement };
		const { subject, content } = await this.generateAIContent(
			"achievement",
			context,
		);

		try {
			const { data } = await this.resend.emails.send({
				from: `Genii <noreply@${this.fromDomain}>`,
				to: [user.email],
				subject,
				html: this.wrapInEmailTemplate(content, user),
				tags: [
					{ name: "type", value: "achievement" },
					{ name: "userId", value: user._id },
					{ name: "achievementType", value: achievement.type },
				],
			});

			await this.trackEmailSent(
				user._id,
				"achievement",
				subject,
				content,
				data?.id,
			);

			return true;
		} catch (error) {
			console.error("Failed to send achievement email:", error);
			return false;
		}
	}

	async sendCourseCompletionEmail(
		userId: string,
		courseDetails: {
			title: string;
			difficulty: string;
			completionTime?: number;
		},
	): Promise<boolean> {
		const user = await this.sanityRepository.getUserById(userId);
		if (!user || !user.email) return false;

		// Check email preferences
		if (user.emailPreferences?.courseCompletionEmails === false) return false;

		const analytics = user.analytics
			? {
					totalXP: user.analytics.totalXP || 0,
					currentLevel: user.analytics.currentLevel || 1,
					studyStreak: user.studyStreak || 0,
				}
			: undefined;

		const context: EmailContext = { user, analytics, courseDetails };
		const { subject, content } = await this.generateAIContent(
			"courseCompletion",
			context,
		);

		try {
			const { data } = await this.resend.emails.send({
				from: `Genii <noreply@${this.fromDomain}>`,
				to: [user.email],
				subject,
				html: this.wrapInEmailTemplate(content, user),
				tags: [
					{ name: "type", value: "courseCompletion" },
					{ name: "userId", value: user._id },
					{ name: "courseTitle", value: courseDetails.title },
				],
			});

			await this.trackEmailSent(
				user._id,
				"courseCompletion",
				subject,
				content,
				data?.id,
			);

			return true;
		} catch (error) {
			console.error("Failed to send course completion email:", error);
			return false;
		}
	}

	async sendWeeklyDigest(
		userId: string,
		weeklyProgress: {
			lessonsCompleted: number;
			timeSpent: number;
			xpGained: number;
		},
	): Promise<boolean> {
		const user = await this.sanityRepository.getUserById(userId);
		if (!user || !user.email) return false;

		// Check email preferences
		if (user.emailPreferences?.weeklyDigest === false) return false;

		// Don't send if user hasn't been active
		if (weeklyProgress.lessonsCompleted === 0 && weeklyProgress.timeSpent === 0)
			return false;

		const analytics = user.analytics
			? {
					totalXP: user.analytics.totalXP || 0,
					currentLevel: user.analytics.currentLevel || 1,
					studyStreak: user.studyStreak || 0,
					weeklyProgress,
				}
			: { totalXP: 0, currentLevel: 1, studyStreak: 0, weeklyProgress };

		const context: EmailContext = { user, analytics };
		const { subject, content } = await this.generateAIContent(
			"weeklyDigest",
			context,
		);

		try {
			const { data } = await this.resend.emails.send({
				from: `Genii <noreply@${this.fromDomain}>`,
				to: [user.email],
				subject,
				html: this.wrapInEmailTemplate(content, user),
				tags: [
					{ name: "type", value: "weeklyDigest" },
					{ name: "userId", value: user._id },
					{
						name: "lessonsCompleted",
						value: weeklyProgress.lessonsCompleted.toString(),
					},
				],
			});

			await this.trackEmailSent(
				user._id,
				"weeklyDigest",
				subject,
				content,
				data?.id,
			);

			return true;
		} catch (error) {
			console.error("Failed to send weekly digest:", error);
			return false;
		}
	}

	private wrapInEmailTemplate(content: string, user: User): string {
		const userName = user.firstname || user.username || "there";

		return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Genii - Your Learning Journey</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background-color: #f8f9fa;
            padding: 20px;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }
        .content {
            margin-bottom: 30px;
        }
        .content p {
            margin-bottom: 16px;
        }
        .cta-button {
            display: inline-block;
            background-color: #4f46e5;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
        }
        .unsubscribe {
            color: #9ca3af;
            text-decoration: none;
            font-size: 12px;
        }
        .highlight {
            background-color: #f3f4f6;
            padding: 15px;
            border-left: 4px solid #4f46e5;
            border-radius: 4px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🧠 Genii</div>
            <p style="margin: 0; color: #6b7280;">Your AI-Powered Learning Companion</p>
        </div>
        
        <div class="content">
            ${content.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}
        </div>
        
        <div class="footer">
            <p>Keep learning and growing! 🚀</p>
            <p>Best regards,<br>The Genii Team</p>
            <p>
                <a href="#" class="unsubscribe">Manage email preferences</a> | 
                <a href="#" class="unsubscribe">Unsubscribe</a>
            </p>
        </div>
    </div>
</body>
</html>`;
	}

	private async trackEmailSent(
		userId: string,
		type: "welcome" | "achievement" | "courseCompletion" | "weeklyDigest",
		subject: string,
		content: string,
		resendId?: string,
	): Promise<void> {
		try {
			// Create email notification record
			await this.sanityRepository.createEmailNotification({
				user: { _ref: userId, _type: "reference" },
				type,
				subject,
				content,
				sentAt: new Date().toISOString(),
				deliveryStatus: "sent",
				resendId: resendId || undefined,
				metadata: { data: JSON.stringify({ timestamp: Date.now() }) },
			});

			// Update user email stats
			await this.sanityRepository.updateUserEmailStats(userId, {
				lastEmailSent: new Date().toISOString(),
				incrementSent: true,
			});
		} catch (error) {
			console.error("Failed to track email:", error);
		}
	}
}
