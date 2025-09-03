import type { Lesson, User } from "../../sanity.types";
import type { VectorSearchResult } from "../domains/shared/types";

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

          TOOLS AVAILABLE:
          - searchResources: Use this tool when you need to find additional course resources, learning materials, or references related to the user's question. This searches through embedded course content and external resources.

          When to use searchResources:
          - User asks for examples or additional explanations
          - User needs supplementary learning materials
          - User asks about specific topics that might benefit from external resources
          - You need more detailed information about a concept

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
