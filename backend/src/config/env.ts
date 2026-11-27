import crypto from 'crypto';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch {
  // dotenv optional in test environment
}

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (raw === undefined || raw.trim() === '') return 1;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true') return 1;
  const hops = Number.parseInt(normalized, 10);
  return Number.isFinite(hops) && hops > 0 ? hops : 1;
}

const usingEphemeralJwtAccessSecret = !process.env.JWT_ACCESS_SECRET;
const usingEphemeralJwtRefreshSecret = !process.env.JWT_REFRESH_SECRET;

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/medicore_db',
  DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/medicore_db',
  REDIS_URL: process.env.REDIS_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '7', 10),
  ARGON2_MEMORY_COST: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
  ARGON2_TIME_COST: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
  ARGON2_PARALLELISM: parseInt(process.env.ARGON2_PARALLELISM || '4', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  AUTH_RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '15', 10),
  BILLING_RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.BILLING_RATE_LIMIT_MAX_REQUESTS || '30', 10),
  MESSAGING_RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.MESSAGING_RATE_LIMIT_MAX_REQUESTS || '40', 10),
  JWT_ISSUER: process.env.JWT_ISSUER || 'medicore-api',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'medicore-clients',
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: parseInt(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS || '60', 10),
  OTP_RESEND_COOLDOWN_SECONDS: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10),
  OTP_EXPIRY_SECONDS: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),
  MAX_OTP_ATTEMPTS: parseInt(process.env.MAX_OTP_ATTEMPTS || '5', 10),
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || 'SMTP').toUpperCase(),
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@medicore-health.in',
  PRIVATE_STORAGE_DIR: process.env.PRIVATE_STORAGE_DIR || './storage/private',
  PAYMENT_GATEWAY_PROVIDER: process.env.PAYMENT_GATEWAY_PROVIDER || 'SANDBOX',
  PAYMENT_GATEWAY_MODE: process.env.PAYMENT_GATEWAY_MODE || 'sandbox',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY),
};

export function validateProductionSecurityConfig(): string[] {
  const warnings: string[] = [];
  if (usingEphemeralJwtAccessSecret || env.JWT_ACCESS_SECRET.length < 32) {
    warnings.push('JWT_ACCESS_SECRET is using an ephemeral or weak value; set a persistent secret in production.');
  }
  if (usingEphemeralJwtRefreshSecret || env.JWT_REFRESH_SECRET.length < 32) {
    warnings.push('JWT_REFRESH_SECRET is using an ephemeral or weak value; set a persistent secret in production.');
  }
  if (env.CORS_ORIGIN === '*') {
    warnings.push('CORS_ORIGIN is set to wildcard *; restrict to specific origins in production.');
  }
  if (!env.REDIS_URL) {
    warnings.push('REDIS_URL is not configured; rate limiting and login attempt tracking use process-local memory (configure Redis for multi-instance production deployments).');
  }
  return warnings;
}
