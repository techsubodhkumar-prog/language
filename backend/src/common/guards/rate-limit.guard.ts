import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator.js';

interface RateLimitBucket {
  tokens: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly storage = new Map<string, RateLimitBucket>();
  private lastCleanup = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { userId: string } }>();
    const res = http.getResponse<Response>();

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
        RATE_LIMIT_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {
        points: 120, // 120 requests per minute default
        durationSeconds: 60,
      };

    this.cleanupOldEntries();

    // Key on user ID if authenticated, else IP address
    const clientIdentifier =
      req.user?.userId ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const routeKey = `${context.getClass().name}:${context.getHandler().name}`;
    const key = `${clientIdentifier}:${routeKey}`;

    const now = Date.now();
    const windowStart = now - options.durationSeconds * 1000;

    let bucket = this.storage.get(key);
    if (!bucket) {
      bucket = { tokens: [] };
      this.storage.set(key, bucket);
    }

    // Filter tokens strictly within current sliding window
    bucket.tokens = bucket.tokens.filter((timestamp) => timestamp > windowStart);

    const remaining = Math.max(0, options.points - bucket.tokens.length);
    const resetTime = Math.ceil(
      (bucket.tokens[0]
        ? bucket.tokens[0] + options.durationSeconds * 1000
        : now + options.durationSeconds * 1000) / 1000,
    );

    res.setHeader('X-RateLimit-Limit', options.points);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining - 1));
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (bucket.tokens.length >= options.points) {
      const retryAfter = Math.ceil(
        (bucket.tokens[0] + options.durationSeconds * 1000 - now) / 1000,
      );
      res.setHeader('Retry-After', Math.max(1, retryAfter));

      this.logger.warn(
        `Rate limit exceeded for [${clientIdentifier}] on [${routeKey}]. Limit: ${options.points}/${options.durationSeconds}s`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please slow down and try again later.',
          error: 'Too Many Requests',
          retryAfterSeconds: Math.max(1, retryAfter),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.tokens.push(now);
    return true;
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    // Run cleanup once every 60 seconds
    if (now - this.lastCleanup < 60000) return;
    this.lastCleanup = now;

    const maxAge = 5 * 60 * 1000; // 5 minutes
    for (const [key, bucket] of this.storage.entries()) {
      bucket.tokens = bucket.tokens.filter((ts) => now - ts < maxAge);
      if (bucket.tokens.length === 0) {
        this.storage.delete(key);
      }
    }
  }
}
