import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InterestsController } from './interests.controller.js';
import { InterestsService } from './interests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InterestsController],
  providers: [InterestsService],
  exports: [InterestsService],
})
export class InterestsModule {}
