import type { QueryResult } from "@upstash/vector";
import type { UIMessage, UIMessagePart } from "ai";
import type {
	ChatMessage,
	ChatMessageQueryResult,
	Lesson,
	User,
} from "../sanity.types.ts";

// Vector search types
export type VectorMetadata = {
	id: string;
	type: "lesson" | "course";
	chunkIndex: number;
};

export type VectorSearchResult = QueryResult<VectorMetadata>;

export function buildSystemPrompt(
	user: User,
	lesson: Lesson,
	context: VectorSearchResult[],
): string {
	const contextContent = context
		.filter((result) => result.data)
		.map((result) => result.data)
		.join("\n");

	return `Kamu adalah tutor AI yang membantu menjelaskan materi pelajaran.

            User Profile:
            - Difficulty Level: ${user.level}
            - Delivery Preference: ${user.delivery_preference}
            - Learning Goals: ${user.learningGoals?.join(", ")}

            Current Lesson: ${lesson.title}

            Relevant Context:
            ${contextContent}

            Jelaskan dengan gaya ${user.delivery_preference} sesuai level ${user.level}.`;
}

export function splitContent(content: string, chunkSize = 500) {
	const sentences = content.split(". ");
	const chunks = [];
	let currentChunk = "";
	let index = 0;

	for (const sentence of sentences) {
		if ((currentChunk + sentence).length > chunkSize && currentChunk) {
			chunks.push({ text: currentChunk.trim(), index: index++ });
			currentChunk = sentence + ". ";
		} else {
			currentChunk += sentence + ". ";
		}
	}

	if (currentChunk) {
		chunks.push({ text: currentChunk.trim(), index: index++ });
	}

	return chunks;
}

// → UI (convert from Sanity doc to UIMessage)
export function toUIMessage(doc: ChatMessageQueryResult): UIMessage {
	if (!doc) {
		return {
			id: "",
			role: "user",
			metadata: undefined,
			parts: [],
		};
	}

	return {
		id: doc.messageId || "",
		role: doc.role || "user",
		metadata: doc.metadata?.custom
			? JSON.parse(doc.metadata.custom)
			: undefined,
		parts: doc.parts?.map((p) => {
			// Handle based on _type since that's what we have in the simplified query
			if (p._type === "toolUIPart") {
				return {
					type: `tool-${p.name || "unknown"}`,
					toolCallId: p.toolCallId,
					...(p.state === "input-streaming" && {
						state: "input-streaming",
						input: p.input?.data ? JSON.parse(p.input.data) : undefined,
					}),
					...(p.state === "input-available" && {
						state: "input-available",
						input: p.input?.data ? JSON.parse(p.input.data) : undefined,
					}),
					...(p.state === "output-available" && {
						state: "output-available",
						input: p.input?.data ? JSON.parse(p.input.data) : undefined,
						output: p.output?.data ? JSON.parse(p.output.data) : undefined,
					}),
					...(p.state === "output-error" && {
						state: "output-error",
						input: p.input?.data ? JSON.parse(p.input.data) : undefined,
						errorText: p.errorText,
					}),
					providerExecuted: p.providerExecuted,
				};
			}
			if (p._type === "dataUIPart") {
				return {
					type: `data-${p.name || "unknown"}`,
					id: p.dataId,
					data: p.data?.content ? JSON.parse(p.data.content) : undefined,
				};
			}
			if (p._type === "reasoningUIPart") {
				return {
					type: "reasoning",
					text: p.text,
					state: p.state,
					providerMetadata: p.providerMetadata?.data
						? JSON.parse(p.providerMetadata.data)
						: undefined,
				};
			}
			if (p._type === "sourceUrlUIPart") {
				return {
					type: "source-url",
					sourceId: p.sourceId,
					url: p.url,
					title: p.title,
					providerMetadata: p.providerMetadata?.data
						? JSON.parse(p.providerMetadata.data)
						: undefined,
				};
			}
			if (p._type === "sourceDocumentUIPart") {
				return {
					type: "source-document",
					sourceId: p.sourceId,
					mediaType: p.mediaType,
					title: p.title,
					filename: p.filename,
					providerMetadata: p.providerMetadata?.data
						? JSON.parse(p.providerMetadata.data)
						: undefined,
				};
			}
			if (p._type === "fileUIPart") {
				return {
					type: "file",
					mediaType: p.mediaType,
					filename: p.filename,
					url: p.url,
				};
			}
			if (p._type === "textUIPart") {
				return {
					type: "text",
					text: p.text || "",
					state: p.state,
				};
			}
			if (p._type === "stepStartUIPart") {
				return {
					type: "step-start",
				};
			}
			// Fallback for unknown types
			return p as any;
		}) || [],
	};
}

// ← DB (convert from UIMessage to Sanity doc format)
export function fromUIMessage(msg: UIMessage, sessionRef: string) {
	return {
		_id: `chatMessage.${msg.id}`,
		_type: "chatMessage",
		messageId: msg.id,
		role: msg.role,
		session: { _ref: sessionRef, _type: "reference" },
		metadata: msg.metadata
			? { custom: JSON.stringify(msg.metadata) }
			: undefined,
		parts: msg.parts.map((part: any, index: number) => {
			const baseObj = {
				_key: `part-${index}`,
				type: part.type,
			};

			if (part.type?.startsWith?.("tool-")) {
				const name = part.type.replace(/^tool-/, "");
				return {
					...baseObj,
					_type: "toolUIPart",
					name,
					toolCallId: part.toolCallId,
					state: part.state,
					input: part.input ? { data: JSON.stringify(part.input) } : undefined,
					output: part.output
						? { data: JSON.stringify(part.output) }
						: undefined,
					errorText: part.errorText,
					providerExecuted: part.providerExecuted,
				};
			}
			if (part.type?.startsWith?.("data-")) {
				const name = part.type.replace(/^data-/, "");
				return {
					...baseObj,
					_type: "dataUIPart",
					name,
					dataId: part.id,
					data: part.data ? { content: JSON.stringify(part.data) } : undefined,
				};
			}
			if (part.type === "reasoning") {
				return {
					...baseObj,
					_type: "reasoningUIPart",
					text: part.text,
					state: part.state,
					providerMetadata: part.providerMetadata
						? { data: JSON.stringify(part.providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "source-url") {
				return {
					...baseObj,
					_type: "sourceUrlUIPart",
					sourceId: part.sourceId,
					url: part.url,
					title: part.title,
					providerMetadata: part.providerMetadata
						? { data: JSON.stringify(part.providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "source-document") {
				return {
					...baseObj,
					_type: "sourceDocumentUIPart",
					sourceId: part.sourceId,
					mediaType: part.mediaType,
					title: part.title,
					filename: part.filename,
					providerMetadata: part.providerMetadata
						? { data: JSON.stringify(part.providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "file") {
				return {
					...baseObj,
					_type: "fileUIPart",
					mediaType: part.mediaType,
					filename: part.filename,
					url: part.url,
				};
			}
			if (part.type === "text") {
				return {
					...baseObj,
					_type: "textUIPart",
					text: part.text,
					state: part.state,
				};
			}
			if (part.type === "step-start") {
				return {
					...baseObj,
					_type: "stepStartUIPart",
				};
			}
			// Default fallback
			return {
				...baseObj,
				_type: "textUIPart",
				text: typeof part === "string" ? part : JSON.stringify(part),
				state: "done",
			};
		}),
	};
}
