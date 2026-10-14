import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  error: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId =
      request.id ?? (request.headers['x-request-id'] as string | undefined);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    } else {
      // Unhandled / database errors must NEVER leak stack traces or query details to clients
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const rawError =
        exception instanceof Error
          ? `${exception.name}: ${exception.message}\n${exception.stack}`
          : JSON.stringify(exception);

      this.logger.error(
        `[${requestId ?? 'no-req-id'}] [${request.method}] ${request.originalUrl ?? request.url} - ${status} - Internal Error: ${rawError}`,
      );
    }

    const payload: ApiErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      message,
      error,
      ...(requestId ? { requestId } : {}),
    };

    response.status(status).json(payload);
  }
}
