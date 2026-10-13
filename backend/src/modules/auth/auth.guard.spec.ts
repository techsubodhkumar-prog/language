import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import type { SupabaseTokenVerifierService } from './supabase-token-verifier.service.js';

function context(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: authorization === undefined ? {} : { authorization },
  };
  return {
    request,
    executionContext: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

describe('AuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const verify = vi.fn();
    const verifier = { verify } as unknown as SupabaseTokenVerifierService;
    const guard = new AuthGuard(verifier);
    const ctx = context();

    await expect(guard.canActivate(ctx.executionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization headers', async () => {
    const verify = vi.fn();
    const verifier = { verify } as unknown as SupabaseTokenVerifierService;
    const guard = new AuthGuard(verifier);

    await expect(
      guard.canActivate(context('Basic abc').executionContext),
    ).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('attaches the verified token identity to the request', async () => {
    const user = { userId: 'verified-subject' };
    const verify = vi.fn().mockResolvedValue(user);
    const verifier = { verify } as unknown as SupabaseTokenVerifierService;
    const guard = new AuthGuard(verifier);
    const ctx = context('Bearer signed-token');

    await expect(guard.canActivate(ctx.executionContext)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('signed-token');
    expect(ctx.request.user).toBe(user);
  });
});
