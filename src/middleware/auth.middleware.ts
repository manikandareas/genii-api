import { getAuth } from "@hono/clerk-auth";
import type { MiddlewareHandler } from "hono";
import { AuthenticationError } from "../domains/shared/errors";

export const requireAuth = (): MiddlewareHandler => {
	return async (c, next) => {
		const auth = getAuth(c);

		if (!auth?.userId) {
			throw new AuthenticationError();
		}

		// Store user ID in context for easy access
		c.set("userId", auth.userId);

		await next();
	};
};
