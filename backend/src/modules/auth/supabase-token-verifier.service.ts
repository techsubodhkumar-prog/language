import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
} from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser } from './auth.types.js';

@Injectable()
export class SupabaseTokenVerifierService {
  private readonly logger = new Logger(SupabaseTokenVerifierService.name);
  private supabaseClient: SupabaseClient | null = null;
  private jwtSecret: Uint8Array | null = null;
  private jwks: JWTVerifyGetKey | null = null;
  private supabaseUrl: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const rawUrl = this.configService.get<string>('SUPABASE_URL');
    if (rawUrl && !rawUrl.includes('placeholder')) {
      this.supabaseUrl = rawUrl.replace(/\/$/, '');
      try {
        const jwksUrl = new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
        this.jwks = createRemoteJWKSet(jwksUrl);
        this.logger.log('Supabase JWKS remote key set initialized (ES256/asymmetric).');
      } catch (err: unknown) {
        this.logger.warn(`Failed to initialize Supabase JWKS: ${(err as Error).message}`);
      }
    }

    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
    if (secret && !secret.includes('placeholder') && secret.trim().length > 0) {
      this.jwtSecret = new TextEncoder().encode(secret.trim());
      this.logger.log('Supabase JWT local verification configured with secret.');
    }

    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    if (
      this.supabaseUrl &&
      supabaseAnonKey &&
      !supabaseAnonKey.includes('placeholder')
    ) {
      this.supabaseClient = createClient(this.supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.logger.log('Supabase client initialized for token verification.');
    }
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException('Authentication token is required');
    }

    const trimmedToken = token.trim();
    let hasAttemptedVerification = false;

    // 1. Verify via Supabase project JWKS (for ES256/asymmetric tokens)
    if (this.jwks) {
      hasAttemptedVerification = true;
      try {
        const options: JWTVerifyOptions = {
          audience: 'authenticated',
        };
        if (this.supabaseUrl) {
          options.issuer = `${this.supabaseUrl}/auth/v1`;
        }
        const { payload } = await jwtVerify(trimmedToken, this.jwks, options);
        if (payload.sub) {
          return {
            userId: payload.sub,
            email: payload.email as string | undefined,
            role: payload.role as string | undefined,
            appMetadata: payload.app_metadata as Record<string, unknown> | undefined,
            userMetadata: payload.user_metadata as Record<string, unknown> | undefined,
          };
        }
      } catch (err: unknown) {
        this.logger.debug?.(`JWKS verification skipped: ${(err as Error).message}`);
      }
    }

    // 2. If symmetric secret is configured (legacy / unit tests), verify HS256 with jose
    if (this.jwtSecret) {
      hasAttemptedVerification = true;
      try {
        const options: JWTVerifyOptions = {
          audience: 'authenticated',
          algorithms: ['HS256'],
        };
        if (this.supabaseUrl) {
          options.issuer = `${this.supabaseUrl}/auth/v1`;
        }
        const { payload } = await jwtVerify(trimmedToken, this.jwtSecret, options);
        if (payload.sub) {
          return {
            userId: payload.sub,
            email: payload.email as string | undefined,
            role: payload.role as string | undefined,
            appMetadata: payload.app_metadata as Record<string, unknown> | undefined,
            userMetadata: payload.user_metadata as Record<string, unknown> | undefined,
          };
        }
      } catch (err: unknown) {
        this.logger.debug?.(`HS256 secret verification skipped: ${(err as Error).message}`);
      }
    }

    // 3. Fall back to Supabase Auth API verification
    if (this.supabaseClient) {
      hasAttemptedVerification = true;
      try {
        const { data, error } = await this.supabaseClient.auth.getUser(trimmedToken);
        if (!error && data?.user) {
          return {
            userId: data.user.id,
            email: data.user.email,
            role: data.user.role,
            appMetadata: data.user.app_metadata,
            userMetadata: data.user.user_metadata,
          };
        }
      } catch (err: unknown) {
        this.logger.debug?.(`Supabase getUser token verification skipped: ${(err as Error).message}`);
      }
    }

    if (!hasAttemptedVerification) {
      throw new UnauthorizedException(
        'Authentication verifier is not configured. Set SUPABASE_URL & SUPABASE_ANON_KEY or SUPABASE_JWT_SECRET.',
      );
    }

    throw new UnauthorizedException('Invalid authentication token');
  }
}
