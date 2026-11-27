import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { env } from '../config/env';
import { normalizePhoneNumber } from '../utils/phone';

const limitExceededResponse = (code: string, message: string) => ({
  success: false,
  error: {
    code,
    message,
  },
});

function normalizeIdentifierForRateLimit(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return (normalizePhoneNumber(trimmed) || trimmed.replace(/[\s()-]/g, '')).toLowerCase();
}

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitExceededResponse(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests from this IP, please try again later.'
  ),
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  skip: () =>
    process.env.DISABLE_AUTH_RATE_LIMIT_FOR_TEST === 'true' ||
    (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true'),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitExceededResponse(
    'AUTH_RATE_LIMIT_EXCEEDED',
    'Too many unsuccessful login attempts. Please try again after the displayed waiting period.'
  ),
});

/**
 * Per-account-identifier rate limiter keyed by normalized email/phone (regardless of source IP).
 * Complements AuthService's atomic 5-attempt lockout policy with request-layer flood protection.
 */
export const accountAuthRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(10, env.AUTH_RATE_LIMIT_MAX_REQUESTS),
  keyGenerator: (req: Request) => {
    const normalized = normalizeIdentifierForRateLimit(req.body?.phone);
    return normalized ? `acct:${normalized}` : `ip:${req.ip || 'unknown'}`;
  },
  skip: () =>
    process.env.DISABLE_AUTH_RATE_LIMIT_FOR_TEST === 'true' ||
    (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true'),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitExceededResponse(
    'ACCOUNT_RATE_LIMIT_EXCEEDED',
    'Too many unsuccessful login attempts. Please try again after the displayed waiting period.'
  ),
});

export const billingRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.BILLING_RATE_LIMIT_MAX_REQUESTS,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitExceededResponse(
    'BILLING_RATE_LIMIT_EXCEEDED',
    'Too many payment or billing attempts, please wait before retrying.'
  ),
});

export const messagingRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.MESSAGING_RATE_LIMIT_MAX_REQUESTS,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  standardHeaders: true,
  legacyHeaders: false,
  message: limitExceededResponse(
    'MESSAGING_RATE_LIMIT_EXCEEDED',
    'Too many messaging or AI requests, please wait before retrying.'
  ),
});
