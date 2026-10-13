import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { InterestsModule } from './modules/interests/interests.module.js';
import { ActivitiesModule } from './modules/activities/activities.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    InterestsModule,
    ActivitiesModule,
    MembershipsModule,
    ChatModule,
    NotificationsModule,
    SafetyModule,
  ],
})
export class AppModule {}
