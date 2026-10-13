import { Module } from '@nestjs/common';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [SupabaseTokenVerifierService, AuthGuard],
  exports: [SupabaseTokenVerifierService, AuthGuard],
})
export class AuthModule {}
