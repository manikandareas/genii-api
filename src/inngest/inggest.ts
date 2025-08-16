import { generateText } from "ai";
import { Inngest } from "inngest";
import { availableModel } from "..";
import { vectorIndex } from "../lib/upstash";
import { saveRecommendation } from "../sanity";
import type { VectorMetadata } from "../utils";

export const inngest = new Inngest({
	id: "api-genii",
});

const recommendationFn = inngest.createFunction(
	{ id: "course-recommendation" },
	{ event: "course/recommendation.triggered" },
	async ({ event, step }) => {
		const query = event.data.query;
		const userId = event.data.userId;

		const courses = await step.run("upstash-semantic-search", async () => {
			const courses = await vectorIndex.query<VectorMetadata>({
				data: query,
				includeMetadata: true,
				includeVectors: false,
				topK: 5,
				filter: "type = 'course'",
			});
			return courses;
		});

		const reason = await step.run("generate-reason", async () => {
			const { text } = await generateText({
				model: availableModel.main,
				messages: [
					{
						role: "system",
						content: [
							"TUGAS: Tulis SATU paragraf alasan yang merangkum mengapa kumpulan course di bawah relevan dengan query pengguna.",
							"GAYA: hangat, suportif, percaya diri; singkat dan padat; fokus pada manfaat nyata.",
							"PANJANG: 3–5 kalimat (≤ 90 kata).",
							"TEKNIK:",
							"• Sintesis pola bersama: topik/tags yang sama, level yang sesuai, tools/stack yang dicari, dan outcomes/praktik.",
							"• Jelaskan alur/progresi (fundamental → intermediate → advanced) bila terlihat.",
							"• Sebut 1–2 contoh spesifik (mis. kata kunci query, tool yang cocok, proyek akhir) untuk memperkuat alasan.",
							"• Jangan mengada-ada; hanya gunakan info di course.data.",
							"• Hindari menyebut daftar semua judul; cukup rujuk kategori/tema umumnya.",
							"• Jika relevansi lemah, sampaikan secara jujur dan sarankan arah yang lebih tepat.",
							"KELUARAN: hanya teks paragraf biasa (tanpa heading, tanpa bullet).",
						].join("\\n"),
					},
					{ role: "user", content: `Query pengguna: ${query}` },
					{
						role: "user",
						content: `Courses (title.difficulty + description): ${JSON.stringify(courses.map((c) => ({ id: c.id, data: c.data })))}`,
					},
				],
			});

			return text;
		});

		await step.run("save-recommendations", async () => {
			await saveRecommendation({
				query,
				reason: reason,
				createdFor: userId,
				courses: courses.map((course) => course.metadata?.id as string),
			});
		});
	},
);

export const functions = [recommendationFn];
