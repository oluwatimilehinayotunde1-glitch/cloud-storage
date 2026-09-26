import { Response } from 'express';

export function sendSuccess(res: Response, data: unknown = {}, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}
