import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { startRecycleBinCleanupJob } from './jobs/recycleBinCleanupJob';
import { ensureKeysLoaded } from './crypto/keyManager';

async function main() {
  ensureKeysLoaded();
  logger.info('RSA keypair loaded successfully');

  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Secure Cloud Storage API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`API docs available at http://localhost:${env.PORT}/api/v1/docs`);
  });

  startRecycleBinCleanupJob();
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
