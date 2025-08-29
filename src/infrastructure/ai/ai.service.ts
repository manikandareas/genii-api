import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { AIServiceError } from "../../domains/shared/errors";
import type {
	AIService,
	ChatContext,
	MessageMetadata,
} from "../../domains/shared/types";
import { buildSystemPrompt } from "../../utils/prompt.utils";

export class OpenAIService implements AIService {
	private readonly models = {
		main: openai("gpt-5-mini"),
		chat: openai("gpt-5-chat-latest"),
	};

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
					// This callback will be handled by the controller layer
					// to save the assistant's response
					const metadata: MessageMetadata = {
						model: result.response.modelId,
						tokens: result.usage.totalTokens || 0,
						processingTime: Date.now() - startProcessingTime,
					};

					// We'll pass this metadata back through context
					(context as any).responseMetadata = metadata;
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
