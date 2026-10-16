import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('validates default development configuration successfully', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.CORS_ORIGIN).toBe('*');
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'invalid_env' })).toThrow(
      /Invalid NODE_ENV/,
    );
  });

  it('rejects invalid PORT numbers', () => {
    expect(() => validateEnv({ PORT: 'not-a-number' })).toThrow(/Invalid PORT/);
    expect(() => validateEnv({ PORT: -10 })).toThrow(/Invalid PORT/);
    expect(() => validateEnv({ PORT: 70000 })).toThrow(/Invalid PORT/);
  });

  it('enforces required production variables when NODE_ENV is production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
      }),
    ).toThrow(/DATABASE_URL is required in production/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://user:placeholder_password@localhost:5432/db',
      }),
    ).toThrow(/DATABASE_URL is required in production and must not be a placeholder/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://postgres.test:realpassword@aws-0.pooler.supabase.com:6543/postgres',
      }),
    ).toThrow(/SUPABASE_URL is required in production/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://postgres.test:realpassword@aws-0.pooler.supabase.com:6543/postgres',
        SUPABASE_URL: 'http://insecure.supabase.co',
      }),
    ).toThrow(/SUPABASE_URL must be a secure HTTPS URL/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://postgres.test:realpassword@aws-0.pooler.supabase.com:6543/postgres',
        SUPABASE_URL: 'https://realproject.supabase.co',
      }),
    ).toThrow(/SUPABASE_ANON_KEY is required in production/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://postgres.test:realpassword@aws-0.pooler.supabase.com:6543/postgres',
        SUPABASE_URL: 'https://realproject.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_realkey123',
        SUPABASE_JWT_SECRET: 'placeholder_secret_string',
      }),
    ).toThrow(/SUPABASE_JWT_SECRET contains a placeholder/);
  });

  it('accepts valid production configuration without placeholder secret', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '10000',
      DATABASE_URL: 'postgresql://postgres.ref:secret@aws-0.pooler.supabase.com:6543/postgres',
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_real_key_abc',
      CORS_ORIGIN: 'https://app.mydomain.com',
      FIREBASE_PROJECT_ID: 'activity-prod',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(10000);
    expect(env.CORS_ORIGIN).toBe('https://app.mydomain.com');
    expect(env.FIREBASE_PROJECT_ID).toBe('activity-prod');
  });
});
