import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, type JWTVerifyOptions } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser } from './auth.types.js';

@Injectable()
export class SupabaseTokenVerifierService {
  private readonly logger = new Logger(SupabaseTokenVerifierService.name);
  private supabaseClient: SupabaseClient | null = null;
  private jwtSecret: Uint8Array | null = null;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('SUPABASE_JWT_SECRET');
    if (secret && !secret.includes('placeholder')) {
      this.jwtSecret = new TextEncoder().encode(secret);
      this.logger.log('Supabase JWT local verification configured with secret.');
    }

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('placeholder') &&
      !supabaseAnonKey.includes('placeholder')
    ) {
      this.supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    // 1. If local secret is configured, verify cryptographically with jose
    if (this.jwtSecret) {
      try {
        const options: JWTVerifyOptions = {
          audience: 'authenticated',
          algorithms: ['HS256'],
        };
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        if (supabaseUrl) {
          options.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
        }
        const { payload } = await jwtVerify(trimmedToken, this.jwtSecret, options);
        if (!payload.sub) {
          throw new UnauthorizedException('Token payload is missing subject claim (sub)');
        }

        return {
          userId: payload.sub,
          email: payload.email as string | undefined,
          role: payload.role as string | undefined,
          appMetadata: payload.app_metadata as Record<string, unknown> | undefined,
          userMetadata: payload.user_metadata as Record<string, unknown> | undefined,
        };
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.warn(`JWT verification failed: ${error.message}`);
        throw new UnauthorizedException('Invalid authentication token');
      }
    }

    // 2. If Supabase client is configured, verify via Supabase Auth API
    if (this.supabaseClient) {
      try {
        const { data, error } = await this.supabaseClient.auth.getUser(trimmedToken);
        if (error || !data.user) {
          throw new UnauthorizedException(error?.message || 'Invalid authentication token');
        }

        return {
          userId: data.user.id,
          email: data.user.email,
          role: data.user.role,
          appMetadata: data.user.app_metadata,
          userMetadata: data.user.user_metadata,
        };
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.warn(`Supabase getUser token verification failed: ${error.message}`);
        throw new UnauthorizedException('Invalid authentication token');
      }
    }

    // 3. Neither verifier is configured with real credentials
    throw new UnauthorizedException(
      'Authentication verifier is not configured. Set SUPABASE_JWT_SECRET or SUPABASE_URL & SUPABASE_ANON_KEY.',
    );
  }
}
