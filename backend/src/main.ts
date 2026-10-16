import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // Security Headers Middleware (Zero-dependency helmet equivalent)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Request size limit to protect against payload denial-of-service
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalFilters(new HttpExceptionFilter());

  // Strict Request DTO Validation: strip and forbid unexpected payload properties
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Environment-specific secure CORS configuration:
  // - Requests without Origin header (native mobile apps, curl, server-to-server) are always permitted.
  // - In production: If explicit domains are listed, enforce them. If '*', block arbitrary web origins with credentials.
  // - In development / test: Permit all origins for seamless local dev & Flutter Web testing.
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const hasExplicitOrigins = corsOrigin && corsOrigin !== '*';
  const allowedList = hasExplicitOrigins
    ? corsOrigin.split(',').map((origin) => origin.trim().toLowerCase())
    : [];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile native apps on Android/iOS, curl, probes)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.trim().toLowerCase();

      // Check explicit allowlist
      if (hasExplicitOrigins) {
        if (allowedList.includes(normalizedOrigin)) {
          return callback(null, true);
        }
        return callback(
          new Error(`CORS policy blocked access from origin: ${origin}`),
        );
      }

      // If CORS_ORIGIN is '*'
      if (isProduction) {
        logger.warn(
          `CORS blocked cross-origin web request from untrusted origin [${origin}]. Configure explicit CORS_ORIGIN in production.`,
        );
        return callback(
          new Error(
            'Cross-origin requests from arbitrary web origins are blocked in production when credentials are enabled. Configure explicit CORS_ORIGIN domains.',
          ),
        );
      }

      // Local development and test environments: permit local web origins
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Request-Id',
    ],
    credentials: true,
    maxAge: 86400,
  });

  // Graceful shutdown hooks for database connections and socket listeners
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(
    `Activity Discovery API listening on http://0.0.0.0:${port}/${apiPrefix}`,
  );
}

await bootstrap();
