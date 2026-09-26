import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    sessionId: string;
  };
}

/**
 * Requires a valid access-token JWT in the Authorization header.
 * Also re-checks that the user is not blocked, since role/status can
 * change after the token was issued.
 */
export function requireAuth() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw ApiError.unauthorized('Missing or invalid Authorization header');
      }

      const token = header.slice('Bearer '.length);
      const payload = verifyAccessToken(token);

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw ApiError.unauthorized('User no longer exists');
      if (user.isBlocked) throw ApiError.forbidden('This account has been blocked');

      req.user = { id: user.id, role: user.role, sessionId: payload.sessionId };
      next();
    } catch (err) {
      // Keep the original status: flattening everything to 401 made a
      // blocked account (403) look like an expired token, which sent the
      // frontend into a pointless refresh-and-retry loop.
      if (err instanceof ApiError) return next(err);
      next(ApiError.unauthorized('Invalid or expired access token'));
    }
  };
}

/** Restricts a route to one or more roles. Must run after requireAuth(). */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}
