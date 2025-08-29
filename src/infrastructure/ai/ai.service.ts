import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { AIServiceError } from "../../domains/shared/errors";
import type {
	AIService,
	ChatContext,
	ChatMessageRepository,
	MessageMetadata,
} from "../../domains/shared/types";
import { buildSystemPrompt } from "../../utils/prompt.utils";

export class OpenAIService implements AIService {
	private readonly models = {
		main: openai("gpt-5-mini"),
		chat: openai("gpt-5-chat-latest"),
	};

	constructor(private messageRepo: ChatMessageRepository) {}

	async generateChatResponse(
		context: ChatContext,
		messages: UIMessage[],
	): Promise<Response> {
		try {
			const systemPrompt = buildSystemPrompt(
				context.user,
				context.lesson,
				context.searchResults,
			);

			const startProcessingTime = Date.now();

			const result = streamText({
				model: this.models.chat,
				system: systemPrompt,
				messages: convertToModelMessages(messages),
				onFinish: async (result) => {
					try {
						const metadata: MessageMetadata = {
							model: result.response.modelId,
							tokens: result.usage.totalTokens || 0,
							processingTime: Date.now() - startProcessingTime,
						};

						// Create assistant message from the completed response
						const assistantMessage: UIMessage = {
							id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
							role: "assistant",
							parts: [
								{
									type: "text",
									text: result.text,
									state: "done",
								},
							],
							metadata,
						};

						// Save the assistant's response
						await this.messageRepo.saveMessage(
							context.session,
							assistantMessage,
							metadata,
						);
					} catch (error) {
						console.error("Failed to save assistant message:", error);
						// Don't throw here to avoid breaking the streaming response
					}
				},
			});

			return result.toUIMessageStreamResponse();
		} catch (error) {
			throw new AIServiceError(
				"Failed to generate chat response",
				error as Error,
			);
		}
	}
}
