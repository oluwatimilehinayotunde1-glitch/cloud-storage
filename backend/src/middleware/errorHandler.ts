import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, data: {} });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error';
  let code: string | undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
  } else if ((err as any)?.name === 'MulterError') {
    const multerError = err as NodeJS.ErrnoException & { code?: string; field?: string };
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        statusCode = 413;
        message = multerError.message || 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_PART_COUNT':
      case 'LIMIT_FIELD_KEY':
      case 'LIMIT_FIELD_VALUE':
      case 'LIMIT_FIELD_COUNT':
      case 'LIMIT_UNEXPECTED_FILE':
        statusCode = 400;
        message = multerError.message || 'Invalid multipart upload';
        break;
      default:
        statusCode = 400;
        message = multerError.message || 'Upload failed';
        break;
    }
  } else if ((err as any)?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  } else if ((err as any)?.name === 'SyntaxError' && 'body' in (err as any)) {
    statusCode = 400;
    message = 'Invalid JSON payload';
  }

  console.error(`[${req.method}] ${req.originalUrl}`, err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  logger.error('Request error', {
    message: err.message,
    stack: env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    code,
  });

  res.status(statusCode).json({
    success: false,
    message,
    code,
    data: {},
  });
}
