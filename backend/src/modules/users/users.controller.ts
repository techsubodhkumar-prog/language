import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { InterestsService } from '../interests/interests.service.js';
import { UpdateUserInterestsDto } from '../interests/dto/update-interests.dto.js';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly interestsService: InterestsService,
  ) {}

  @Get('me')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Put('me')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.upsertProfile(user.userId, dto);
  }

  @Patch('me')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async patchMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.upsertProfile(user.userId, dto);
  }

  @Get('me/interests')
  async getMyInterests(@CurrentUser() user: AuthenticatedUser) {
    const interests = await this.interestsService.getUserInterests(user.userId);
    return {
      count: interests.length,
      interests,
    };
  }

  @Put('me/interests')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async replaceMyInterests(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserInterestsDto,
  ) {
    const interests = await this.interestsService.replaceUserInterests(
      user.userId,
      dto.interestIds,
    );
    return {
      count: interests.length,
      interests,
    };
  }
}
