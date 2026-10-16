import {
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SupabaseTokenVerifierService } from '../auth/supabase-token-verifier.service.js';
import { ChatService } from './chat.service.js';
import type { ChatMessage } from './chat.types.js';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      userId: string;
      email?: string;
      role?: string;
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly tokenVerifier: SupabaseTokenVerifierService,
  ) {}

  /**
   * Authenticates Socket.IO connections using verified Supabase access tokens.
   * Rejects unauthenticated connections immediately.
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const authHeader =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers?.authorization as string | undefined) ??
        (client.handshake.query?.token as string | undefined);

      if (!authHeader) {
        this.logger.warn(`Socket connection rejected: missing token [id: ${client.id}]`);
        client.emit('chat:error', { message: 'Authentication token is required.' });
        client.disconnect(true);
        return;
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const user = await this.tokenVerifier.verify(token);

      client.data.user = {
        userId: user.userId,
        email: user.email,
        role: user.role,
      };

      this.logger.log(`Socket authenticated for user: ${user.userId} [id: ${client.id}]`);
    } catch {
      this.logger.warn(`Socket authentication failed [id: ${client.id}]`);
      client.emit('chat:error', { message: 'Invalid or expired authentication token.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Socket disconnected [id: ${client.id}]`);
  }

  /**
   * Joins an activity chat room after verifying membership authorization.
   */
  @SubscribeMessage('join_activity')
  @SubscribeMessage('activity:join')
  async handleJoinActivity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { activityId: string },
  ) {
    const user = client.data.user;
    if (!user) {
      return { error: 'Unauthorized. Please reconnect with a valid token.' };
    }

    const activityId = payload?.activityId;
    if (!activityId) {
      return { error: 'activityId is required.' };
    }

    try {
      await this.chatService.authorizeMember(activityId, user.userId);
      const room = `activity:${activityId}`;
      await client.join(room);
      this.logger.log(`User ${user.userId} joined chat room ${room}`);
      return { status: 'joined', activityId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Access denied.';
      return { error: message };
    }
  }

  /**
   * Leaves an activity chat room.
   */
  @SubscribeMessage('leave_activity')
  @SubscribeMessage('activity:leave')
  async handleLeaveActivity(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { activityId: string },
  ) {
    const activityId = payload?.activityId;
    if (activityId) {
      const room = `activity:${activityId}`;
      await client.leave(room);
      return { status: 'left', activityId };
    }
    return { status: 'left' };
  }

  /**
   * Sends a message via Socket.IO:
   * 1. Authenticates sender from server-side socket state.
   * 2. Checks authorization and persists in PostgreSQL.
   * 3. Broadcasts to room members only after successful write.
   */
  @SubscribeMessage('send_message')
  @SubscribeMessage('activity:message:send')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { activityId: string; content: string },
  ) {
    const user = client.data.user;
    if (!user) {
      return { error: 'Unauthorized.' };
    }

    const { activityId, content } = payload ?? {};
    if (!activityId || !content) {
      return { error: 'activityId and content are required.' };
    }

    try {
      // Persist in database first (strictly authorizes member and writes to PostgreSQL)
      const savedMessage = await this.chatService.saveMessage(
        activityId,
        { userId: user.userId, email: user.email },
        content,
      );

      // Broadcast to room members only after DB write succeeds
      const room = `activity:${activityId}`;
      this.server.to(room).emit('new_message', savedMessage);
      this.server.to(room).emit('message_created', savedMessage);

      return { status: 'sent', message: savedMessage };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send message.';
      return { error: message };
    }
  }

  /**
   * Broadcasts a persisted message to the activity room.
   */
  broadcastMessage(activityId: string, message: ChatMessage): void {
    if (this.server) {
      const room = `activity:${activityId}`;
      this.server.to(room).emit('new_message', message);
      this.server.to(room).emit('message_created', message);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.server) {
      this.logger.log('Gracefully closing Socket.IO connections...');
      await this.server.close();
    }
  }
}
