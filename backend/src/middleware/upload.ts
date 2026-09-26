import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

/**
 * Allow-list of MIME types the system accepts, per spec section 8.
 * Files are held in memory only long enough to be hashed + encrypted,
 * then immediately written to storage - never left as plaintext on disk.
 */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/quicktime',
  'application/zip',
  'application/x-zip-compressed',
]);

/** Strips path components and dangerous characters from a client-supplied filename. */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, ''); // strip any directory components
  return base.replace(/[^a-zA-Z0-9.\-_ ]/g, '_').slice(0, 255);
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`) as unknown as Error);
    }
    cb(null, true);
  },
});
