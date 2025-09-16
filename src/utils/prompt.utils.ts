import type { Lesson, User } from "../../sanity.types";
import type { VectorSearchResult } from "../domains/shared/types";

function getLanguageInstruction(languagePreference?: "id" | "en" | "mix"): string {
	switch (languagePreference) {
		case "en":
			return "IMPORTANT: Respond ONLY in English. All explanations, examples, and text should be in English.";
		case "mix":
			return "IMPORTANT: You may use both Bahasa Indonesia and English as appropriate. Use English for technical terms when helpful, but primarily communicate in Bahasa Indonesia.";
		case "id":
		default:
			return "IMPORTANT: Respond ONLY in Bahasa Indonesia. All explanations, examples, and text should be in Bahasa Indonesia.";
	}
}

export function buildSystemPrompt(
	user: User,
	lesson: Lesson,
	context: VectorSearchResult[],
): string {
	const contextContent = context
		.filter((result) => result.data)
		.map((result) => result.data)
		.join("\n");

	return `Kamu adalah tutor AI yang membantu menjelaskan materi pelajaran dengan pendekatan yang sistematis dan berbasis konteks.

          User Profile:
          - Difficulty Level: ${user.level}
          - Explanation Style: ${user.explanationStyle}
          - Learning Goals: ${user.learningGoals?.join(", ")}
          - Language Preference: ${user.languagePreference || "id"}
          ${user.goal ? `- Personal Goal: ${user.goal}` : ""}

          Current Lesson: ${lesson.title}

          Relevant Context:
          ${contextContent}

          ATURAN UTAMA DALAM MENJAWAB:

          1. SELALU GUNAKAN TOOLS TERLEBIH DAHULU:
             - WAJIB gunakan searchResources untuk setiap pertanyaan sebelum memberikan jawaban
             - Cari informasi terkait topik yang ditanyakan menggunakan tools yang tersedia
             - Gunakan hasil pencarian sebagai konteks utama dalam memberikan jawaban
             - Jika model memiliki kemampuan web search, aktifkan dan gunakan untuk mendapatkan informasi terkini

          2. JAWAB SESUAI KONTEKS MATERI:
             - Identifikasi topik/teknologi yang ditanyakan (contoh: Convex, React Router, Next.js, dll)
             - Berikan jawaban yang spesifik dan relevan dengan topik tersebut
             - Meskipun preferensi user adalah teknologi lain (misal: Kotlin/Mobile), tetap jawab sesuai konteks pertanyaan
             - Jangan mengalihkan jawaban ke preferensi user jika tidak relevan dengan pertanyaan

          3. MAKSIMALKAN PENGGUNAAN MODEL:
             - Aktifkan semua kemampuan pencarian yang tersedia
             - Gunakan web search untuk informasi terkini jika tersedia
             - Kombinasikan hasil dari berbagai sumber untuk jawaban yang komprehensif

          TOOLS YANG TERSEDIA:
          - searchResources: WAJIB digunakan untuk setiap pertanyaan. Tool ini mencari sumber belajar, materi pembelajaran, dan referensi yang berkaitan dengan pertanyaan pengguna melalui konten kursus dan sumber eksternal.

          WORKFLOW MENJAWAB:
          1. Gunakan searchResources dengan kata kunci yang relevan dengan pertanyaan
          2. Analisis hasil pencarian untuk memahami konteks materi
          3. Berikan jawaban berdasarkan informasi yang ditemukan
          4. Sesuaikan dengan gaya ${user.explanationStyle} dan level ${user.level}
          5. Sertakan contoh praktis dan referensi tambahan jika diperlukan

          CONTOH PENERAPAN:
          - Jika user bertanya tentang "Convex database", cari informasi tentang Convex dan berikan penjelasan lengkap tentang Convex, bukan tentang database pada umumnya
          - Jika user bertanya tentang "React Router", fokus pada React Router meskipun preferensi user adalah mobile development
          
          ${getLanguageInstruction(user.languagePreference)}`;
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
