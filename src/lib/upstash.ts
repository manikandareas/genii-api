import { Index } from "@upstash/vector";

export const vectorIndex = Index.fromEnv({
	UPSTASH_VECTOR_REST_TOKEN: process.env.UPSTASH_VECTOR_REST_TOKEN as string,
	UPSTASH_VECTOR_REST_URL: process.env.UPSTASH_VECTOR_REST_URL as string,
});
