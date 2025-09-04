import type { MiddlewareHandler } from "hono";
import { DomainError } from "../domains/shared/errors";
import type { ApiResponse } from "../domains/shared/types";

export const errorHandler = (): MiddlewareHandler => {
	return async (c, next) => {
		try {
			await next();
		} catch (error) {
			console.error("Error caught by middleware:", error);

			if (error instanceof DomainError) {
				const response: ApiResponse = {
					success: false,
					error: {
						code: error.code,
						message: error.message,
						details: error.details,
					},
				};

				return c.json(response, error.statusCode as any);
			}

			// Handle unknown errors
			const response: ApiResponse = {
				success: false,
				error: {
					code: "INTERNAL_ERROR",
					message: "Terjadi kesalahan yang tidak terduga",
				},
			};

			return c.json(response, 500);
		}
	};
};
