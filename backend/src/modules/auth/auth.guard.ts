import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service.js';
import type { AuthenticatedUser } from './auth.types.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenVerifier: SupabaseTokenVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException(
        'Invalid Authorization format. Expected: Bearer <token>',
      );
    }

    const token = parts[1];
    const user = await this.tokenVerifier.verify(token);
    request.user = user;
    return true;
  }
}
