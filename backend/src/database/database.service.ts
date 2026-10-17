import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg, { type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getDatabaseSslConfig } from './database-ssl.util.js';

const { Pool } = pg;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (databaseUrl && !databaseUrl.includes('placeholder')) {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      const rejectUnauthorized = this.configService.get<string>(
        'DATABASE_SSL_REJECT_UNAUTHORIZED',
      );
      const caCert =
        this.configService.get<string>('DATABASE_CA_CERT') ||
        this.configService.get<string>('PGSSLROOTCERT');

      const sslConfig = getDatabaseSslConfig(
        databaseUrl,
        nodeEnv,
        rejectUnauthorized,
        caCert,
      );

      if (sslConfig && !sslConfig.rejectUnauthorized) {
        this.logger.warn(
          'SECURITY WARNING: PostgreSQL SSL certificate verification is disabled (DATABASE_SSL_REJECT_UNAUTHORIZED=false).',
        );
      }

      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ...(sslConfig ? { ssl: sslConfig } : {}),
      });

      this.pool.on('error', (err) => {
        this.logger.error(`Unexpected PostgreSQL client error: ${err.message}`);
      });
    } else {
      this.logger.warn(
        'DATABASE_URL not configured or contains placeholder. Database operations will require active configuration.',
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) {
      this.logger.error(
        'Database readiness probe failed: connection pool is not initialized (DATABASE_URL may be missing, invalid, or contains placeholder).',
      );
      this.isConnected = false;
      return false;
    }
    try {
      const res = await this.pool.query('SELECT 1 AS alive');
      this.isConnected = res.rows.length > 0;
      return this.isConnected;
    } catch (err: unknown) {
      this.isConnected = false;
      const error = err as { code?: string; message?: string; name?: string };
      const errorCode = error?.code || error?.name || 'UNKNOWN_DB_ERROR';
      const sanitizedMessage = this.sanitizeErrorMessage(
        error?.message || 'Database diagnostic SELECT 1 query failed',
      );
      this.logger.error(
        `Database readiness probe failed [${errorCode}]: ${sanitizedMessage}`,
      );
      return false;
    }
  }

  /**
   * Sanitizes database error messages to prevent accidental leakage of
   * passwords, connection strings, or authorization secrets into application logs.
   */
  sanitizeErrorMessage(message: string): string {
    return message
      .replace(/(postgresql|postgres):\/\/[^\s@]+@/gi, '$1://***:***@')
      .replace(/(password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=***')
      .replace(/\r?\n|\r/g, ' ')
      .trim();
  }


  getPool(): pg.Pool | null {
    return this.pool;
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error(
        'Database connection unavailable: DATABASE_URL is not configured with an active PostgreSQL instance.',
      );
    }
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error(
        'Database connection unavailable: DATABASE_URL is not configured with an active PostgreSQL instance.',
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      const p = this.pool;
      this.pool = null;
      await p.end();
      this.logger.log('PostgreSQL connection pool closed');
    }
  }

  async onApplicationShutdown() {
    await this.onModuleDestroy();
  }
}
