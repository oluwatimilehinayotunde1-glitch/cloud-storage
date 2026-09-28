import { errorHandler } from '../src/middleware/errorHandler';
import { ApiError } from '../src/utils/apiError';

describe('upload error handling', () => {
  it('maps multer file-size limits to 413', () => {
    const req = { originalUrl: '/api/v1/files/upload', method: 'POST' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    errorHandler({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'File too large' } as any, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('File too large'),
      })
    );
  });

  it('keeps ApiError status codes without masking them as 500', () => {
    const req = { originalUrl: '/api/v1/files/upload', method: 'POST' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    errorHandler(ApiError.unauthorized('Missing or invalid Authorization header'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Missing or invalid Authorization header',
      })
    );
  });
});
