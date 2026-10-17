import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';

export interface HealthCheckResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  database: 'connected' | 'disconnected';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  getHealth(): HealthCheckResponse {
    return {
      status: 'ok',
      service: 'activity-discovery-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const isDbConnected = await this.databaseService.isHealthy();
    if (!isDbConnected) {
      this.logger.warn(
        'Readiness probe failed: database connection is disconnected or unreachable. Returning 503 Service Unavailable.',
      );
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        status: 'degraded',
        database: 'disconnected',
        message: 'Database connection is disconnected or unreachable',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}

