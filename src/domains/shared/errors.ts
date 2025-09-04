export abstract class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = 'Autentikasi diperlukan') {
    super(message, 'AUTH_REQUIRED', 401);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = 'Akses ditolak') {
    super(message, 'ACCESS_DENIED', 403);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} dengan ID ${id} tidak ditemukan` : `${resource} tidak ditemukan`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class RepositoryError extends DomainError {
  constructor(message: string, originalError?: Error) {
    super(message, 'REPOSITORY_ERROR', 500, { originalError: originalError?.message });
  }
}

export class AIServiceError extends DomainError {
  constructor(message: string, originalError?: Error) {
    super(message, 'AI_SERVICE_ERROR', 500, { originalError: originalError?.message });
  }
}

export class VectorServiceError extends DomainError {
  constructor(message: string, originalError?: Error) {
    super(message, 'VECTOR_SERVICE_ERROR', 500, { originalError: originalError?.message });
  }
}