import type { UIMessage } from "ai";
import type { ChatMessageQueryResult } from "../../sanity.types";

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
		parts:
			doc.parts?.map((p) => {
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
					toolCallId: (part as any).toolCallId,
					state: (part as any).state,
					input: (part as any).input
						? { data: JSON.stringify((part as any).input) }
						: undefined,
					output: (part as any).output
						? { data: JSON.stringify((part as any).output) }
						: undefined,
					errorText: (part as any).errorText,
					providerExecuted: (part as any).providerExecuted,
				};
			}
			if (part.type?.startsWith?.("data-")) {
				const name = part.type.replace(/^data-/, "");
				return {
					...baseObj,
					_type: "dataUIPart",
					name,
					dataId: (part as any).id,
					data: (part as any).data
						? { content: JSON.stringify((part as any).data) }
						: undefined,
				};
			}
			if (part.type === "reasoning") {
				return {
					...baseObj,
					_type: "reasoningUIPart",
					text: (part as any).text,
					state: (part as any).state,
					providerMetadata: (part as any).providerMetadata
						? { data: JSON.stringify((part as any).providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "source-url") {
				return {
					...baseObj,
					_type: "sourceUrlUIPart",
					sourceId: (part as any).sourceId,
					url: (part as any).url,
					title: (part as any).title,
					providerMetadata: (part as any).providerMetadata
						? { data: JSON.stringify((part as any).providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "source-document") {
				return {
					...baseObj,
					_type: "sourceDocumentUIPart",
					sourceId: (part as any).sourceId,
					mediaType: (part as any).mediaType,
					title: (part as any).title,
					filename: (part as any).filename,
					providerMetadata: (part as any).providerMetadata
						? { data: JSON.stringify((part as any).providerMetadata) }
						: undefined,
				};
			}
			if (part.type === "file") {
				return {
					...baseObj,
					_type: "fileUIPart",
					mediaType: (part as any).mediaType,
					filename: (part as any).filename,
					url: (part as any).url,
				};
			}
			if (part.type === "text") {
				return {
					...baseObj,
					_type: "textUIPart",
					text: (part as any).text,
					state: (part as any).state,
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
