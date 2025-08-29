import type { UIMessage } from "ai";
import type {
  ChatMessageParams,
  ChatResponse,
  ChatContext,
  AIService,
  VectorService,
  MessageMetadata
} from "../shared/types";
import type {
  UserRepository,
  LessonRepository,
  ChatSessionRepository,
  ChatMessageRepository
} from "../shared/types";
import { NotFoundError } from "../shared/errors";

export class ChatService {
  constructor(
    private userRepo: UserRepository,
    private lessonRepo: LessonRepository,
    private sessionRepo: ChatSessionRepository,
    private messageRepo: ChatMessageRepository,
    private aiService: AIService,
    private vectorService: VectorService
  ) {}

  async processMessage(params: ChatMessageParams): Promise<Response> {
    const { user, lessonId, messages } = params;
    
    // Get the lesson
    const lesson = await this.lessonRepo.getLessonById(lessonId);
    if (!lesson) {
      throw new NotFoundError("Lesson", lessonId);
    }

    // Get or create chat session
    let session = await this.sessionRepo.getActiveSession(user._id, lessonId);
    if (!session) {
      session = await this.sessionRepo.createSession(user._id, lessonId);
    } else {
      // Update last activity
      await this.sessionRepo.updateLastActivity(session._id);
    }

    // Save user message before processing
    const userMessage = messages[messages.length - 1];
    if (userMessage && userMessage.role === "user") {
      await this.messageRepo.saveMessage(session, userMessage);
    }

    // Get the last message for context search
    const lastMessageText = this.extractTextFromMessage(userMessage);
    if (!lastMessageText) {
      throw new Error("No message content provided");
    }

    // Search for relevant context
    const searchResults = await this.vectorService.searchContext(lastMessageText, lessonId);

    // Build context for AI
    const context: ChatContext = {
      user,
      lesson,
      session,
      searchResults,
    };

    // Generate response
    const response = await this.aiService.generateChatResponse(context, messages);

    // Note: The AI service will handle saving the assistant's response through its onFinish callback
    // This is handled in the infrastructure layer to maintain proper separation of concerns

    return response;
  }

  async getChatHistory(userId: string, lessonId: string): Promise<UIMessage[]> {
    return await this.messageRepo.getChatHistory(userId, lessonId);
  }

  private extractTextFromMessage(message: UIMessage): string | null {
    if (!message.parts || message.parts.length === 0) {
      return null;
    }

    // Find the first text part
    const textPart = message.parts.find((part) => 
      part.type === "text" && "text" in part && part.text
    );

    return textPart ? (textPart as any).text : null;
  }

  async saveAssistantResponse(
    session: any,
    assistantMessage: UIMessage,
    metadata?: MessageMetadata
  ): Promise<void> {
    await this.messageRepo.saveMessage(session, assistantMessage, metadata);
  }
}