import { createApp } from './app';
import { env, validateProductionSecurityConfig } from './config/env';
import { prisma } from './database/prisma';
import { seedDatabaseIfEmpty } from './database/seed';
import { StructuredLogger } from './modules/security/security.service';

import {
  loadPersistedDatabase,
  persistDatabaseNow,
  getPersistenceStatus,
  getSharedFirebaseMetadata,
} from './database/persistence';

async function bootstrap() {
  // Validate required environment variables before starting
  if (!process.env.DATABASE_URL && !env.DATABASE_URL) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }
  if (!process.env.JWT_ACCESS_SECRET && !env.JWT_ACCESS_SECRET) {
    throw new Error('Missing required environment variable: JWT_ACCESS_SECRET');
  }

  // Hydrate persisted unified database snapshot shared by Web & Android clients before seeding
  const hydrated = loadPersistedDatabase();
  const seededOrMigrated = await seedDatabaseIfEmpty().catch(() => false);
  if (!hydrated || seededOrMigrated) {
    persistDatabaseNow();
  }

  const warnings = validateProductionSecurityConfig();
  if (warnings.length > 0 && env.NODE_ENV === 'production') {
    for (const warning of warnings) {
      StructuredLogger.warn('security.config.warning', { warning });
    }
  }

  const app = createApp();
  const port = Number(process.env.PORT) || 4000;
  const persistence = getPersistenceStatus();
  const firebaseMeta = getSharedFirebaseMetadata();

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    StructuredLogger.info('server.started', {
      port,
      apiPrefix: env.API_PREFIX,
      env: env.NODE_ENV,
      persistenceEngine: persistence.engine,
      hydratedFromDisk: persistence.hydratedFromDisk,
      firestoreDatabaseId: firebaseMeta.firestoreDatabaseId,
    });
  });

  const shutdown = async (signal: string) => {
    StructuredLogger.info('server.shutdown.initiated', { signal });
    persistDatabaseNow();
    server.close(async () => {
      try {
        await prisma?.$disconnect();
      } catch {
        // Ignore disconnect error if DB client wasn't initialized
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  StructuredLogger.error('server.bootstrap.failed', {
    message: err instanceof Error ? err.message : String(err),
  });
  console.error('Server bootstrap failed:', err);
  process.exit(1);
});
