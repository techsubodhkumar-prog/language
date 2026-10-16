import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { SignJWT, generateKeyPair } from 'jose';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service.js';

describe('SupabaseTokenVerifierService', () => {
  const secretKey = 'super-secret-test-key-of-sufficient-length-12345';
  let configService: ConfigService;
  let verifier: SupabaseTokenVerifierService;

  beforeEach(() => {
    configService = new ConfigService({
      SUPABASE_JWT_SECRET: secretKey,
    });
    verifier = new SupabaseTokenVerifierService(configService);
  });

  it('verifies a valid signed JWT and returns authenticated user context', async () => {
    const rawSecret = new TextEncoder().encode(secretKey);
    const token = await new SignJWT({
      email: 'user@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { name: 'Test User' },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-12345-uuid')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(rawSecret);

    const user = await verifier.verify(token);

    expect(user.userId).toBe('sub-12345-uuid');
    expect(user.email).toBe('user@example.com');
    expect(user.role).toBe('authenticated');
  });

  it('verifies an ES256 token using JWKS key resolver', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const es256Verifier = new SupabaseTokenVerifierService(
      new ConfigService({
        SUPABASE_URL: 'https://mock-proj.supabase.co',
      }),
    );
    // Point internal jwks resolver to mock public key
    (es256Verifier as any).jwks = async () => publicKey;

    const token = await new SignJWT({
      email: 'ecdsa-user@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('https://mock-proj.supabase.co/auth/v1')
      .setSubject('sub-ecdsa-uuid')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const user = await es256Verifier.verify(token);
    expect(user.userId).toBe('sub-ecdsa-uuid');
    expect(user.email).toBe('ecdsa-user@example.com');
  });

  it('falls back to Supabase client auth.getUser when JWKS is not configured or bypassed', async () => {
    const mockClient = {
      auth: {
        getUser: async (token: string) => {
          if (token === 'valid-api-token') {
            return {
              data: {
                user: {
                  id: 'supabase-api-user-id',
                  email: 'api-user@example.com',
                  role: 'authenticated',
                  app_metadata: {},
                  user_metadata: {},
                },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: new Error('Invalid token') };
        },
      },
    };

    const clientVerifier = new SupabaseTokenVerifierService(new ConfigService({}));
    (clientVerifier as any).supabaseClient = mockClient;

    const user = await clientVerifier.verify('valid-api-token');
    expect(user.userId).toBe('supabase-api-user-id');
    expect(user.email).toBe('api-user@example.com');
  });

  it('rejects an empty or missing token', async () => {
    await expect(verifier.verify('')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed token', async () => {
    await expect(verifier.verify('not.a.valid.jwt')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const rawSecret = new TextEncoder().encode(secretKey);
    const expiredToken = await new SignJWT({ email: 'expired@example.com', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-expired')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(rawSecret);

    await expect(verifier.verify(expiredToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with the wrong key', async () => {
    const wrongSecret = new TextEncoder().encode('completely-different-signing-key-67890');
    const wrongKeyToken = await new SignJWT({ email: 'hacker@example.com', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-hacker')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecret);

    await expect(verifier.verify(wrongKeyToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException if verifier is unconfigured', async () => {
    const emptyConfig = new ConfigService({});
    const unconfiguredVerifier = new SupabaseTokenVerifierService(emptyConfig);

    await expect(unconfiguredVerifier.verify('any-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
