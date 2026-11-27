import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/errors';
import { env } from '../config/env';
import { securityStore, StructuredLogger } from '../modules/security/security.service';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      securityStore.metrics.totalErrors += 1;
    }
    if (
      err.statusCode === 429 &&
      err.details &&
      typeof err.details === 'object' &&
      'retryAfterSeconds' in err.details
    ) {
      res.setHeader('Retry-After', String((err.details as { retryAfterSeconds: number }).retryAfterSeconds));
    }
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    });
    return;
  }

  // Handle malformed JSON bodies cleanly without leaking parser internals
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Invalid JSON request payload.',
      },
    });
    return;
  }

  securityStore.metrics.totalErrors += 1;
  const sanitizedDiagnostic = StructuredLogger.sanitizePayload({
    method: req.method,
    path: req.originalUrl,
    userId: req.auth?.userId ?? null,
    errorName: err.name,
    errorMessage: env.NODE_ENV === 'production' ? 'INTERNAL_ERROR' : err.message,
  });
  if (env.NODE_ENV !== 'test') {
    console.error('[MediCore Error]', JSON.stringify(sanitizedDiagnostic));
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected internal error occurred.'
          : err.message || 'An unexpected server error occurred',
    },
  });
}
