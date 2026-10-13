import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InterestsModule } from '../interests/interests.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, InterestsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
