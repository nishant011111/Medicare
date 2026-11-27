import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, validateProductionSecurityConfig } from './config/env';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { getPaymentGatewayProvider } from './modules/billing/payment-gateway.provider';
import authRoutes from './modules/auth/auth.routes';
import hospitalsRoutes from './modules/hospitals/hospitals.routes';
import adminHospitalsRoutes from './modules/hospitals/admin-hospitals.routes';
import membershipsRoutes from './modules/memberships/memberships.routes';
import clinicalRoutes from './modules/clinical/clinical.routes';
import operationsRoutes from './modules/operations/operations.routes';
import aiRoutes from './modules/ai/ai.routes';
import securityRoutes from './modules/security/security.routes';
import saasRoutes from './modules/saas/saas.routes';
import directoryRoutes from './modules/directory/directory.routes';
import patientProfileRoutes from './modules/patient/patient-profile.routes';
import patientDashboardRoutes from './modules/patient/patient-dashboard.routes';
import patientDiscoveryRoutes from './modules/patient/patient-discovery.routes';
import patientAppointmentsRoutes from './modules/patient/patient-appointments.routes';
import patientMedicationsRoutes from './modules/patient/patient-medications.routes';
import patientBillingRoutes from './modules/billing/patient-billing.routes';
import { securityStore } from './modules/security/security.service';
import { directoryStore } from './modules/directory/directory.service';
import { clinicalStore } from './modules/clinical/clinical.service';
import { db } from './database/prisma';
import {
  getPersistenceStatus,
  getSharedFirebaseMetadata,
  schedulePersistDatabase,
} from './database/persistence';

import { EmailDeliveryService } from './utils/email';
import { AuthService } from './modules/auth/auth.service';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);

  // Security headers & CORS
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'"],
              },
            }
          : false,
    })
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN === '*' && env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS policy'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Hospital-Id',
        'X-Razorpay-Signature',
        'Idempotency-Key',
      ],
    })
  );

  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(globalRateLimiter);

  // Prevent browser/proxy caching of authenticated medical, billing & PII payloads
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Track request count for observability & auto-persist unified database on mutating API calls
  app.use((req, res, next) => {
    securityStore.metrics.totalApiRequests += 1;
    if (
      req.path.startsWith('/api') &&
      (req.method === 'POST' ||
        req.method === 'PUT' ||
        req.method === 'PATCH' ||
        req.method === 'DELETE')
    ) {
      res.on('finish', () => {
        if (res.statusCode < 500) {
          schedulePersistDatabase();
        }
      });
    }
    next();
  });

  // Health & Readiness Endpoints (/health, /health/live, /health/ready)
  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      service: 'MediCore Enterprise Healthcare Platform API',
      version: '15.0.0',
      status: 'UP',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      success: true,
      liveness: 'ALIVE',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', (_req, res) => {
    const dbConfigured = Boolean(
      process.env.DATABASE_URL &&
        !process.env.DATABASE_URL.includes('placeholder') &&
        !process.env.DATABASE_URL.startsWith('postgresql://localhost')
    );
    const warnings = validateProductionSecurityConfig();
    const gatewayConfigured = getPaymentGatewayProvider().isConfigured();
    const persistence = getPersistenceStatus();
    const firebaseMeta = getSharedFirebaseMetadata();

    res.status(200).json({
      success: true,
      readiness: 'READY',
      unifiedBackend: true,
      sharedClients: ['WEB_STAFF_CONSOLE', 'ANDROID_PATIENT_APP'],
      databaseConfigured: dbConfigured,
      databaseStatus: dbConfigured
        ? 'CONFIGURED_POSTGRESQL'
        : persistence.enabled
          ? 'UNIFIED_PERSISTENT_STORE'
          : 'IN_MEMORY_TEST_STORE',
      persistence,
      firestoreProjectId: firebaseMeta.projectId,
      firestoreDatabaseId: firebaseMeta.firestoreDatabaseId,
      gatewayConfigured,
      gatewayMode: env.PAYMENT_GATEWAY_MODE,
      emailProvider: EmailDeliveryService.getActiveProviderName(),
      emailConfigured: EmailDeliveryService.isConfigured(),
      loginAttemptStore: AuthService.getLoginAttemptStoreName(),
      securityWarningsCount: warnings.length,
      directoryRecordsLoaded: directoryStore.records.size,
      unifiedCounts: {
        users: db.users.size,
        hospitals: db.hospitals.size,
        patientProfiles: db.patientProfiles.size,
        clinicalPatients: clinicalStore.patients.size,
        appointments: clinicalStore.appointments.size,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Versioned REST API Routes (/api/v1)
  const apiPrefix = env.API_PREFIX;
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/hospitals`, hospitalsRoutes);
  app.use(`${apiPrefix}`, membershipsRoutes);
  app.use(`${apiPrefix}/admin`, adminHospitalsRoutes);
  app.use(`${apiPrefix}`, clinicalRoutes);
  app.use(`${apiPrefix}`, operationsRoutes);
  app.use(`${apiPrefix}/ai`, aiRoutes);
  app.use(`${apiPrefix}`, patientProfileRoutes);
  app.use(`${apiPrefix}`, patientDashboardRoutes);
  app.use(`${apiPrefix}`, patientDiscoveryRoutes);
  app.use(`${apiPrefix}`, patientAppointmentsRoutes);
  app.use(`${apiPrefix}`, patientMedicationsRoutes);
  app.use(`${apiPrefix}`, patientBillingRoutes);
  app.use(`${apiPrefix}`, securityRoutes);
  app.use(`${apiPrefix}`, saasRoutes);
  app.use(`${apiPrefix}`, directoryRoutes);

  // Clean /api aliases for patient & auth endpoints so both /api/v1/* and /api/* work consistently
  app.use('/api/auth', authRoutes);
  app.use('/api', patientProfileRoutes);
  app.use('/api', patientDashboardRoutes);
  app.use('/api', patientDiscoveryRoutes);
  app.use('/api', patientAppointmentsRoutes);
  app.use('/api', patientMedicationsRoutes);
  app.use('/api', patientBillingRoutes);

  // Serve compiled Web frontend bundle in production when present
  const candidateWebDistDirs = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../../../web/dist'),
  ];
  const webDistDir = candidateWebDistDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  if (env.NODE_ENV === 'production' && webDistDir) {
    const webIndexPath = path.join(webDistDir, 'index.html');
    app.use(express.static(webDistDir));
    app.get(/^(?!\/api(?:\/|$)|\/health(?:\/|$)).*/, (_req, res) => {
      res.sendFile(webIndexPath);
    });
  }

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
