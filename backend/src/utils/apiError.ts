export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  /** Optional machine-readable code, for cases where the frontend needs
   *  to branch on *why* a request failed, not just show `message`
   *  (e.g. VAULT_LOCKED vs VAULT_UNLOCK_EXPIRED vs VAULT_UNLOCK_INVALID). */
  public code?: string;

  constructor(statusCode: number, message: string, isOperational = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string) { return new ApiError(400, message); }
  static unauthorized(message = 'Unauthorized') { return new ApiError(401, message); }
  static forbidden(message = 'Forbidden', code?: string) { return new ApiError(403, message, true, code); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message: string) { return new ApiError(409, message); }
  static tooManyRequests(message = 'Too many requests') { return new ApiError(429, message); }
  static internal(message = 'Internal server error') { return new ApiError(500, message, false); }
}
