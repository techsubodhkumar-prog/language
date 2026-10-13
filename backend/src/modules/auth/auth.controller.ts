import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedUser } from './auth.types.js';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return {
      authenticated: true,
      user,
    };
  }
}
