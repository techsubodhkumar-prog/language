import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import {
  RegisterDeviceTokenDto,
  RemoveDeviceTokenDto,
} from './dto/register-device-token.dto.js';
import type {
  NotificationListResponse,
  NotificationRecord,
  UnreadCountResponse,
} from './notifications.types.js';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsDto,
  ): Promise<NotificationListResponse> {
    return this.notificationsService.listNotifications(user, query);
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponse> {
    return this.notificationsService.getUnreadCount(user);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationRecord> {
    return this.notificationsService.markAsRead(id, user);
  }

  @Patch('read-all')
  markAllAsRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllAsRead(user);
  }

  @Delete(':id')
  dismiss(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ notificationId: string; dismissed: boolean }> {
    return this.notificationsService.dismiss(id, user);
  }

  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  registerToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceTokenDto,
  ): Promise<{ registered: boolean }> {
    return this.notificationsService.registerDeviceToken(
      user,
      dto.token,
      dto.deviceType,
    );
  }

  @Delete('device-token')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  removeToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RemoveDeviceTokenDto,
  ): Promise<{ removed: boolean }> {
    return this.notificationsService.removeDeviceToken(user, dto.token);
  }

  @Delete('device-token/:token')
  @HttpCode(HttpStatus.OK)
  removeTokenByParam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<{ removed: boolean }> {
    return this.notificationsService.removeDeviceToken(user, token);
  }
}

@Controller('activities/reminders')
export class ActivityRemindersController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  processReminders(
    @Headers('x-cron-secret') cronHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ sentCount: number; skippedCount: number }> {
    const expectedSecret = this.configService.get<string>('CRON_SECRET');
    if (expectedSecret && expectedSecret.trim().length > 0) {
      const authBearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
      if (cronHeader !== expectedSecret && authBearer !== expectedSecret) {
        throw new UnauthorizedException('Invalid or missing CRON_SECRET.');
      }
    }
    return this.notificationsService.processUpcomingReminders();
  }
}
