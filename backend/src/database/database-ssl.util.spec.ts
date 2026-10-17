import { describe, it, expect } from 'vitest';
import {
  getDatabaseSslConfig,
  SUPABASE_ROOT_2021_CA,
} from './database-ssl.util.js';

describe('getDatabaseSslConfig', () => {
  it('returns undefined for local development databases without sslmode', () => {
    const config = getDatabaseSslConfig(
      'postgresql://postgres:pass@localhost:5432/db',
      'development',
    );
    expect(config).toBeUndefined();
  });

  it('enforces rejectUnauthorized: true and attaches SUPABASE_ROOT_2021_CA for remote Supabase poolers by default', () => {
    const config = getDatabaseSslConfig(
      'postgresql://postgres.ref:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres',
      'production',
    );
    expect(config).toBeDefined();
    expect(config?.rejectUnauthorized).toBe(true);
    expect(config?.ca).toBe(SUPABASE_ROOT_2021_CA);
  });

  it('enforces rejectUnauthorized: true when sslmode=require is present in URL', () => {
    const config = getDatabaseSslConfig(
      'postgresql://user:pass@db.internal:5432/db?sslmode=require',
      'development',
    );
    expect(config).toBeDefined();
    expect(config?.rejectUnauthorized).toBe(true);
  });

  it('allows explicit insecure opt-out only when DATABASE_SSL_REJECT_UNAUTHORIZED is "false"', () => {
    const config = getDatabaseSslConfig(
      'postgresql://postgres.ref:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres',
      'production',
      'false',
    );
    expect(config).toBeDefined();
    expect(config?.rejectUnauthorized).toBe(false);
  });

  it('attaches custom CA certificate content when provided, overriding default Supabase CA', () => {
    const mockCa =
      '-----BEGIN CERTIFICATE-----\nMOCK_CERT_CONTENT\n-----END CERTIFICATE-----';
    const config = getDatabaseSslConfig(
      'postgresql://postgres.ref:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres',
      'production',
      undefined,
      mockCa,
    );
    expect(config?.rejectUnauthorized).toBe(true);
    expect(config?.ca).toBe(mockCa);
  });
});

