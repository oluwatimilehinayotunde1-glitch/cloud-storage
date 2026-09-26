import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { apiRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { swaggerSpec } from './config/swagger';

import authRoutes from './routes/authRoutes';
import fileRoutes from './routes/fileRoutes';
import folderRoutes from './routes/folderRoutes';
import recycleBinRoutes from './routes/recycleBinRoutes';
import shareRoutes from './routes/shareRoutes';
import publicShareRoutes from './routes/publicShareRoutes';
import activityRoutes from './routes/activityRoutes';
import adminRoutes from './routes/adminRoutes';
import vaultRoutes from './routes/vaultRoutes';

/**
 * Prisma maps PostgreSQL BIGINT columns (sizeBytes, storageUsedBytes,
 * storageQuotaBytes) to JavaScript BigInt. JSON.stringify throws
 * "Do not know how to serialize a BigInt", which would make every
 * endpoint that returns a file or storage quota fail with a 500.
 *
 * Serialising as a decimal string is what the frontend already expects
 * (see formatBytes() and the `sizeBytes: string` response types).
 */
Object.defineProperty(BigInt.prototype, 'toJSON', {
  value: function toJSON(this: bigint) {
    return this.toString();
  },
  writable: true,
  configurable: true,
});

export function createApp() {
  const app = express();

  // Needed so req.ip and express-rate-limit see the real client IP when
  // the API sits behind nginx / a load balancer (see frontend/nginx.conf).
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use('/api', apiRateLimiter);

  app.get('/health', (req, res) => res.json({ success: true, message: 'OK', data: { status: 'healthy' } }));

  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/files', fileRoutes);
  app.use('/api/v1/folders', folderRoutes);
  app.use('/api/v1/recycle-bin', recycleBinRoutes);
  app.use('/api/v1/shares', shareRoutes);
  app.use('/api/v1/share', publicShareRoutes); // public, token-based
  app.use('/api/v1/activity', activityRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/vault', vaultRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
