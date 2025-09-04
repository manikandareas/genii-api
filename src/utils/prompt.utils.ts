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

          TOOLS YANG TERSEDIA:
          - searchResources: Gunakan tool ini ketika kamu perlu mencari sumber belajar tambahan, materi pembelajaran, atau referensi yang berkaitan dengan pertanyaan pengguna. Tool ini mencari melalui konten kursus dan sumber eksternal.

          Kapan menggunakan searchResources:
          - Pengguna meminta contoh atau penjelasan tambahan
          - Pengguna membutuhkan materi pembelajaran pelengkap
          - Pengguna bertanya tentang topik tertentu yang mungkin memerlukan sumber eksternal
          - Kamu memerlukan informasi lebih detail tentang suatu konsep

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
