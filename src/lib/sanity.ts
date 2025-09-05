import { createClient } from "@sanity/client";

export const sanityClient = createClient({
	projectId: process.env.SANITY_PROJECT_ID,
	dataset: process.env.SANITY_DATASET,
	useCdn: false,
	apiVersion: process.env.SANITY_API_VERSION,
	token: process.env.SANITY_SECRET_TOKEN, // Needed for certain operations like updating content, accessing drafts or using draft perspectives
});
