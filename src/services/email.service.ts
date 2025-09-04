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
	private readonly emailModel = openai(
		process.env.AI_EMAIL_MODEL || "o4-mini-2025-04-16",
	);

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
			model: this.emailModel,
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
		const basePrompt = `Kamu adalah asisten AI yang membuat konten email yang menarik dan personal untuk platform edukasi bernama Genii. 

Email yang kamu buat harus:
- Hangat, memberi semangat, dan motivasi
- Profesional namun ramah
- Fokus pada perjalanan belajar pengguna
- Menyertakan langkah selanjutnya yang bisa dilakukan jika diperlukan
- Konten yang ringkas dan mudah dibaca

Selalu mulai responmu dengan "Subject: [subjek email]" diikuti konten email.`;

		switch (emailType) {
			case "welcome":
				return `${basePrompt}

Kamu sedang membuat email selamat datang untuk pengguna baru. Fokus pada:
- Menyambut mereka dalam perjalanan belajar
- Menyoroti manfaat utama platform
- Mendorong mereka untuk memulai pelajaran pertama
- Membuat mereka merasa didukung dan bersemangat`;

			case "achievement":
				return `${basePrompt}

Kamu sedang membuat email perayaan pencapaian. Fokus pada:
- Merayakan pencapaian spesifik mereka
- Mengakui dedikasi dan kemajuan mereka
- Mendorong pembelajaran berkelanjutan
- Membuat mereka merasa bangga dengan pencapaian mereka`;

			case "courseCompletion":
				return `${basePrompt}

Kamu sedang membuat email perayaan penyelesaian kursus. Fokus pada:
- Mengucapkan selamat atas penyelesaian kursus
- Menyoroti keterampilan kunci yang telah mereka peroleh
- Menyarankan langkah selanjutnya atau kursus yang relevan
- Mempertahankan momentum dalam perjalanan belajar mereka`;

			case "weeklyDigest":
				return `${basePrompt}

Kamu sedang membuat email ringkasan kemajuan mingguan. Fokus pada:
- Merangkum aktivitas belajar dalam seminggu
- Menyoroti pencapaian dan milestone penting
- Memberikan wawasan tentang pola belajar mereka
- Mendorong kemajuan berkelanjutan dengan saran spesifik`;

			default:
				return basePrompt;
		}
	}

	private getUserPrompt(emailType: string, context: EmailContext): string {
		const { user, analytics, achievement, courseDetails } = context;

		const userName = user.firstname || user.username || "there";
		const userLevel = user.level || "beginner";

		let prompt = `Buatkan email ${emailType} untuk ${userName} (level ${userLevel}).`;

		switch (emailType) {
			case "welcome":
				prompt += ` Ini adalah interaksi pertama mereka dengan platform kami. Tujuan belajar mereka: ${user.learningGoals?.join(", ") || "keterampilan programming umum"}.`;
				break;

			case "achievement":
				if (achievement) {
					prompt += ` Mereka baru saja mencapai: ${achievement.details}`;
					if (achievement.value) {
						prompt += ` (${achievement.value})`;
					}
					
					// Add special context for level-up achievements
					if (achievement.type === "level_up" && achievement.value) {
						if (achievement.value === 2) {
							prompt += ` Ini adalah level up pertama mereka! Buat email yang sangat motivational dan welcoming.`;
						} else if (achievement.value % 5 === 0) {
							prompt += ` Ini adalah milestone level ${achievement.value}! Rayakan pencapaian besar ini dengan antusias.`;
						}
					}
				}
				if (analytics) {
					prompt += ` Statistik saat ini: ${analytics.totalXP} XP, Level ${analytics.currentLevel}, streak ${analytics.studyStreak} hari.`;
				}
				break;

			case "courseCompletion":
				if (courseDetails) {
					prompt += ` Mereka baru saja menyelesaikan kursus "${courseDetails.title}" (level ${courseDetails.difficulty})`;
					if (courseDetails.completionTime) {
						prompt += ` dalam ${courseDetails.completionTime} menit`;
					}
				}
				if (analytics) {
					prompt += ` Kemajuan saat ini: ${analytics.totalXP} XP, Level ${analytics.currentLevel}.`;
				}
				break;

			case "weeklyDigest":
				if (analytics?.weeklyProgress) {
					const { lessonsCompleted, timeSpent, xpGained } =
						analytics.weeklyProgress;
					prompt += ` Minggu ini mereka menyelesaikan ${lessonsCompleted} pelajaran, menghabiskan ${timeSpent} menit belajar, dan mendapatkan ${xpGained} XP.`;
				}
				if (analytics) {
					prompt += ` Kemajuan keseluruhan: ${analytics.totalXP} total XP, Level ${analytics.currentLevel}, streak ${analytics.studyStreak} hari.`;
				}
				break;
		}

		return prompt;
	}

	private getDefaultSubject(emailType: string, context: EmailContext): string {
		const userName = context.user.firstname || context.user.username || "there";

		switch (emailType) {
			case "welcome":
				return `Selamat datang di Genii, ${userName}! Perjalanan belajarmu dimulai dari sini 🚀`;
			case "achievement":
				return `Kerja luar biasa, ${userName}! Kamu telah membuka pencapaian baru 🎉`;
			case "courseCompletion":
				return `Selamat ${userName}! Kursus telah diselesaikan 🎓`;
			case "weeklyDigest":
				return `Ringkasan belajar mingguan ${userName} 📊`;
			default:
				return `Update dari Genii`;
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

	shouldSendLevelUpEmail(oldLevel: number, newLevel: number): boolean {
		// Send email for first level up (1 -> 2)
		if (oldLevel === 1 && newLevel === 2) {
			return true;
		}
		
		// Send email for multiples of 5 (5, 10, 15, 20, etc.)
		if (newLevel % 5 === 0 && newLevel > oldLevel) {
			return true;
		}
		
		return false;
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
