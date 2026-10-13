import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { InterestsService } from './interests.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UpdateUserInterestsDto } from './dto/update-interests.dto.js';

@Controller('interests')
export class InterestsController {
  constructor(private readonly interestsService: InterestsService) {}

  @Get()
  async getAvailableInterests() {
    const interests = await this.interestsService.listAvailableInterests();
    return {
      count: interests.length,
      interests,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMyInterests(@CurrentUser() user: AuthenticatedUser) {
    const interests = await this.interestsService.getUserInterests(user.userId);
    return {
      count: interests.length,
      interests,
    };
  }

  @Put('me')
  @UseGuards(AuthGuard)
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
