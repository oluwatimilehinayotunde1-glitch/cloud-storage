import { Request, Response, NextFunction, RequestHandler } from 'express';

/** Wraps an async route handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
