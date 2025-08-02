import type { QueryResult } from "@upstash/vector";
import type { Lesson, User } from "../sanity.types";

// Vector search types
export type VectorMetadata = {
	id: string;
	type: "lesson" | "course";
	content: string;
	chunkIndex: number;
};

export type VectorSearchResult = QueryResult<VectorMetadata>;

export function buildSystemPrompt(
	user: User,
	lesson: Lesson,
	context: VectorSearchResult[],
): string {
	const contextContent = context
		.filter((result) => result.metadata?.content)
		.map((result) => result.metadata?.content)
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
