import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ChatService } from './chat.service.js';
import { ChatGateway } from './chat.gateway.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { ListMessagesDto } from './dto/list-messages.dto.js';
import type { ChatHistoryResponse, ChatMessage } from './chat.types.js';

import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';

@Controller('activities/:activityId/messages')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listMessages(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMessagesDto,
  ): Promise<ChatHistoryResponse> {
    return this.chatService.getMessages(activityId, user, query);
  }

  @Post()
  @RateLimit({ points: 60, durationSeconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async sendMessage(
    @Param('activityId') activityId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessage> {
    const message = await this.chatService.saveMessage(
      activityId,
      user,
      dto.content,
    );
    // Broadcast newly persisted message to active Socket.IO room members
    this.chatGateway.broadcastMessage(activityId, message);
    return message;
  }
}
