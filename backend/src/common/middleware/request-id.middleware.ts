import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export interface RequestWithId extends Request {
  id?: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-request-id'];
    const requestId =
      typeof rawHeader === 'string' && rawHeader.trim().length > 0
        ? rawHeader.trim()
        : randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const elapsedMs = Number((end - start) / 1000000n);

      // Safe production logging without authorization tokens, bodies, or query secrets
      const urlWithoutTokens = req.originalUrl || req.url;
      const status = res.statusCode;

      const logMsg = `[${requestId}] ${req.method} ${urlWithoutTokens} ${status} - ${elapsedMs}ms`;

      if (status >= 500) {
        this.logger.error(logMsg);
      } else if (status >= 400) {
        this.logger.warn(logMsg);
      } else {
        this.logger.log(logMsg);
      }
    });

    next();
  }
}
