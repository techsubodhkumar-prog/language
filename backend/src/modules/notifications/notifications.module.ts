import { Global, Module } from '@nestjs/common';
import { NotificationsController, ActivityRemindersController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FcmPushService } from './fcm-push.service.js';

import { AuthModule } from '../auth/auth.module.js';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, ActivityRemindersController],
  providers: [NotificationsService, FcmPushService],
  exports: [NotificationsService, FcmPushService],
})
export class NotificationsModule {}
