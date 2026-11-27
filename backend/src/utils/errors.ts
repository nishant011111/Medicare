export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, codeOrDetails?: unknown, details?: unknown) {
    if (typeof codeOrDetails === 'string') {
      return new ApiError(400, codeOrDetails, message, details);
    }
    return new ApiError(400, 'BAD_REQUEST', message, codeOrDetails);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED', details?: unknown) {
    return new ApiError(401, code, message, details);
  }

  static forbidden(message = 'Insufficient permissions for this resource', code = 'FORBIDDEN', details?: unknown) {
    return new ApiError(403, code, message, details);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND', details?: unknown) {
    return new ApiError(404, code, message, details);
  }

  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new ApiError(409, code, message, details);
  }

  static tooManyRequests(
    message = 'Too many requests, please try again later',
    code = 'RATE_LIMIT_EXCEEDED',
    details?: unknown
  ) {
    return new ApiError(429, code, message, details);
  }
}
