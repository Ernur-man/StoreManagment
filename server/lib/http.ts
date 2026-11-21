import type { HttpRequest as Request, HttpResponse as Response, NextFunction, RequestHandler } from './router.js';
import { ZodError } from 'zod';
import { handlePrismaKnownError } from './audit.js';
import { firstZodMessage } from './validation.js';

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  // Return the promise so the Next.js adapter waits for the handler to finish
  // before serializing the response. Express tolerates either behavior, but a
  // dropped promise here produced an empty 200 before login wrote its cookie.
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'NOT_FOUND', message: 'errors.notFound' });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: firstZodMessage(error) });
    return;
  }
  const prismaError = handlePrismaKnownError(error);
  if (prismaError) {
    res.status(prismaError.status).json({ error: 'DATA_ERROR', message: prismaError.message });
    return;
  }
  console.error('[WishStock API]', error);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'errors.internal' });
}
