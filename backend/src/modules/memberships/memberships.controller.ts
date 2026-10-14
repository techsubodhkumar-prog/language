import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MembershipsService } from './memberships.service.js';

import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';

@Controller()
@UseGuards(AuthGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Post('activities/:id/join')
  @RateLimit({ points: 30, durationSeconds: 60 })
  join(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.join(id, user);
  }

  @Get('memberships/me')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.memberships.mine(user);
  }

  @Get('activities/:id/membership')
  current(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.current(id, user);
  }

  @Delete('activities/:id/membership')
  withdraw(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.withdraw(id, user);
  }

  @Get('activities/:id/requests')
  requests(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.requests(id, user);
  }

  @Post('activities/:activityId/requests/:membershipId/approve')
  @RateLimit({ points: 30, durationSeconds: 60 })
  approve(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.decide(activityId, membershipId, user, 'approved');
  }

  @Post('activities/:activityId/requests/:membershipId/reject')
  @RateLimit({ points: 30, durationSeconds: 60 })
  reject(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.decide(activityId, membershipId, user, 'rejected');
  }

  @Get('activities/:id/participants')
  participants(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.participants(id, user);
  }
}
