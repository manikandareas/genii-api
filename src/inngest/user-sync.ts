import { Inngest } from "inngest";
import { emailService, sanityRepository } from "../infrastructure/container";

// Create the Inngest instance locally to avoid circular dependency
const inngest = new Inngest({
	id: "api-genii",
});

// Type definitions for Clerk webhook events
interface ClerkUser {
	id: string;
	email_addresses: Array<{
		email_address: string;
		id: string;
	}>;
	first_name: string | null;
	last_name: string | null;
	username: string | null;
	created_at: number;
	updated_at: number;
}

interface ClerkWebhookEvent {
	data: ClerkUser;
	object: string;
	type: string;
}

// Handle user creation from Clerk
export const syncUserCreated = inngest.createFunction(
	{ id: "sync-user-created" },
	{ event: "clerk/user.created" },
	async ({ event }) => {
		const clerkEvent = event.data as ClerkWebhookEvent;
		const clerkUser = clerkEvent.data;

		// Check if user already exists to prevent duplicates
		const existingUser = await sanityRepository.getUserByClerkId(clerkUser.id);
		if (existingUser) {
			console.log(`User with Clerk ID ${clerkUser.id} already exists`);
			return { success: true, message: "Pengguna sudah ada" };
		}

		// Create new user in Sanity
		const newUser = await sanityRepository.createUser({
			clerkId: clerkUser.id,
			email: clerkUser.email_addresses[0]?.email_address || "",
			firstname: clerkUser.first_name || "",
			lastname: clerkUser.last_name || "",
			username: clerkUser.username || `user_${clerkUser.id.slice(0, 8)}`,
			onboardingStatus: "not_started",
			level: "beginner",
		});

		// Send welcome email in the background
		try {
			if (newUser._id) {
				await emailService.sendWelcomeEmail(newUser._id);
			}
		} catch (error) {
			console.error("Failed to send welcome email:", error);
			// Don't fail the user creation if email fails
		}

		return { success: true, message: "Pengguna berhasil dibuat" };
	},
);

// Handle user updates from Clerk
export const syncUserUpdated = inngest.createFunction(
	{ id: "sync-user-updated" },
	{ event: "clerk/user.updated" },
	async ({ event }) => {
		const clerkEvent = event.data as ClerkWebhookEvent;
		const clerkUser = clerkEvent.data;

		// Find existing user
		const existingUser = await sanityRepository.getUserByClerkId(clerkUser.id);
		if (!existingUser) {
			console.log(
				`User with Clerk ID ${clerkUser.id} not found, creating new user`,
			);
			// Create user if doesn't exist (edge case)
			await sanityRepository.createUser({
				clerkId: clerkUser.id,
				email: clerkUser.email_addresses[0]?.email_address || "",
				firstname: clerkUser.first_name || "",
				lastname: clerkUser.last_name || "",
				username: clerkUser.username || `user_${clerkUser.id.slice(0, 8)}`,
				onboardingStatus: "not_started",
				level: "beginner",
			});
			return { success: true, message: "Pengguna dibuat dari event update" };
		}

		// Update user in Sanity
		await sanityRepository.updateUser(existingUser._id, {
			email: clerkUser.email_addresses[0]?.email_address,
			firstname: clerkUser.first_name,
			lastname: clerkUser.last_name,
			username: clerkUser.username,
		});

		return { success: true, message: "Pengguna berhasil diperbarui" };
	},
);

// Handle user deletion from Clerk
export const syncUserDeleted = inngest.createFunction(
	{ id: "sync-user-deleted" },
	{ event: "clerk/user.deleted" },
	async ({ event }) => {
		const clerkEvent = event.data as ClerkWebhookEvent;
		const clerkUser = clerkEvent.data;

		// Find existing user
		const existingUser = await sanityRepository.getUserByClerkId(clerkUser.id);
		if (!existingUser) {
			console.log(`User with Clerk ID ${clerkUser.id} not found for deletion`);
			return { success: true, message: "Pengguna tidak ditemukan, tidak ada yang dihapus" };
		}

		// Soft delete or anonymize user data instead of hard delete
		// This preserves chat history and other user-generated content
		await sanityRepository.anonymizeUser(existingUser._id);

		return { success: true, message: "Pengguna berhasil dianonimkan" };
	},
);

// Export all user sync functions
export const userSyncFunctions = [
	syncUserCreated,
	syncUserUpdated,
	syncUserDeleted,
];
