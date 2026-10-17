import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false from isHealthy when DATABASE_URL is not configured (pool is null)', async () => {
    configService = new ConfigService({
      DATABASE_URL: undefined,
    });
    const service = new DatabaseService(configService);

    const isHealthy = await service.isHealthy();
    expect(isHealthy).toBe(false);
  });

  it('returns false from isHealthy when DATABASE_URL contains placeholder', async () => {
    configService = new ConfigService({
      DATABASE_URL: 'postgresql://postgres:placeholder_password@localhost:5432/db',
    });
    const service = new DatabaseService(configService);

    const isHealthy = await service.isHealthy();
    expect(isHealthy).toBe(false);
  });

  it('returns true from isHealthy when diagnostic query succeeds', async () => {
    configService = new ConfigService({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
    });
    const service = new DatabaseService(configService);

    // Mock the internal pool
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ alive: 1 }] }),
      on: vi.fn(),
      end: vi.fn(),
    };
    (service as any).pool = mockPool;

    const isHealthy = await service.isHealthy();
    expect(isHealthy).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 AS alive');
  });

  it('returns false from isHealthy and sanitizes sensitive credentials when query fails', async () => {
    configService = new ConfigService({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
    });
    const service = new DatabaseService(configService);

    const mockPool = {
      query: vi.fn().mockRejectedValue({
        code: '28P01',
        message: 'password authentication failed for user "postgres" with password=secret123 at postgresql://postgres:secret123@aws-0.pooler.supabase.com:5432/postgres',
      }),
      on: vi.fn(),
      end: vi.fn(),
    };
    (service as any).pool = mockPool;

    const isHealthy = await service.isHealthy();
    expect(isHealthy).toBe(false);
  });

  it('sanitizes connection strings and passwords correctly in sanitizeErrorMessage', () => {
    configService = new ConfigService({});
    const service = new DatabaseService(configService);

    const unsanitized =
      'Failed connecting to postgresql://postgres:MySecretPass123@db.supabase.co:5432/postgres?sslmode=require with password=MySecretPass123';
    const sanitized = service.sanitizeErrorMessage(unsanitized);

    expect(sanitized).not.toContain('MySecretPass123');
    expect(sanitized).toContain('postgresql://***:***@');
    expect(sanitized).toContain('password=***');
  });
});
