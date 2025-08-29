import type { QueryResult } from "@upstash/vector";
import type { UIMessage } from "ai";
import type { User, Lesson, ChatSession } from "../../../sanity.types";

// Vector search types
export type VectorMetadata = {
  id: string;
  type: "lesson" | "course";
  chunkIndex: number;
};

export type VectorSearchResult = QueryResult<VectorMetadata>;

// Chat domain types
export interface ChatMessageParams {
  user: User;
  lessonId: string;
  messages: UIMessage[];
}

export interface ChatResponse {
  sessionId: string;
  stream: ReadableStream;
}

export interface ChatContext {
  user: User;
  lesson: Lesson;
  session: ChatSession;
  searchResults: VectorSearchResult[];
}

// Recommendation domain types
export interface RecommendationParams {
  query: string;
  userId: string;
}

export interface RecommendationResult {
  status: 'processing' | 'completed' | 'failed';
  message: string;
  jobId?: string;
}

// Repository interfaces
export interface UserRepository {
  getUserByClerkId(clerkId: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;
}

export interface LessonRepository {
  getLessonById(lessonId: string): Promise<Lesson | null>;
}

export interface ChatSessionRepository {
  getActiveSession(userId: string, lessonId: string): Promise<ChatSession | null>;
  createSession(userId: string, lessonId: string): Promise<ChatSession>;
  updateLastActivity(sessionId: string): Promise<void>;
}

export interface ChatMessageRepository {
  saveMessage(session: ChatSession, message: UIMessage, metadata?: MessageMetadata): Promise<void>;
  getChatHistory(userId: string, lessonId: string): Promise<UIMessage[]>;
}

// Service interfaces
export interface AIService {
  generateChatResponse(context: ChatContext, messages: UIMessage[]): Promise<Response>;
}

export interface VectorService {
  searchContext(query: string, lessonId: string, topK?: number): Promise<VectorSearchResult[]>;
  searchCourseRecommendations(query: string, topK?: number): Promise<VectorSearchResult[]>;
}

// Metadata types
export interface MessageMetadata {
  model?: string;
  tokens?: number;
  processingTime?: number;
  [key: string]: any;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Request validation types
export interface ChatRequest {
  lessonId: string;
  messages: UIMessage[];
}

export interface RecommendationRequest {
  query: string;
}