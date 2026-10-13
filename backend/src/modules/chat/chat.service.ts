import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { ListMessagesDto } from './dto/list-messages.dto.js';
import type {
  ChatHistoryResponse,
  ChatMemberAuthorization,
  ChatMessage,
} from './chat.types.js';

interface MessageRow extends QueryResultRow {
  message_id: string;
  activity_id: string;
  sender_id: string;
  content: string;
  created_at: Date | string;
  sender_supabase_user_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
}

@Injectable()
export class ChatService {
  // In-memory rate limiting: track message timestamps per user
  private readonly rateLimits = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 5000;
  private readonly RATE_LIMIT_MAX_MESSAGES = 10;

  constructor(private readonly database: DatabaseService) {}

  /**
   * Authorizes that a user is either the host or an approved participant of the activity.
   * Derives authorization strictly from verified server state, never client claims.
   */
  async authorizeMember(
    activityId: string,
    supabaseUserId: string,
  ): Promise<ChatMemberAuthorization> {
    if (!activityId || typeof activityId !== 'string') {
      throw new BadRequestException('A valid activityId is required.');
    }
    if (!supabaseUserId || typeof supabaseUserId !== 'string') {
      throw new ForbiddenException('User authentication is required.');
    }

    try {
      const activityResult = await this.database.query<{
        activity_id: string;
        host_user_id: string;
        status: string;
      }>(
        'SELECT activity_id, host_user_id, status FROM activities WHERE activity_id = $1',
        [activityId],
      );

      const activity = activityResult.rows[0];
      if (!activity) {
        throw new NotFoundException('Activity not found.');
      }

      const profileResult = await this.database.query<{
        user_id: string;
        display_name: string;
        avatar_url: string | null;
      }>(
        'SELECT user_id, display_name, avatar_url FROM profiles WHERE supabase_user_id = $1',
        [supabaseUserId],
      );

      const profile = profileResult.rows[0];
      if (!profile) {
        throw new NotFoundException('User profile not found.');
      }

      // Check if user is the activity host
      if (activity.host_user_id === profile.user_id) {
        return {
          profileId: profile.user_id,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
          isHost: true,
        };
      }

      // If not host, verify current membership status is 'approved'
      const membershipResult = await this.database.query<{ status: string }>(
        'SELECT status FROM activity_memberships WHERE activity_id = $1 AND user_id = $2',
        [activityId, profile.user_id],
      );

      const membership = membershipResult.rows[0];
      if (!membership || membership.status !== 'approved') {
        throw new ForbiddenException(
          'Only the host and approved participants can access this activity chat.',
        );
      }

      return {
        profileId: profile.user_id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        isHost: false,
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Applies rate limiting per user (max 10 messages per 5 seconds).
   */
  private checkRateLimit(userId: string): void {
    const now = Date.now();
    const timestamps = this.rateLimits.get(userId) ?? [];
    const validTimestamps = timestamps.filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW_MS,
    );

    if (validTimestamps.length >= this.RATE_LIMIT_MAX_MESSAGES) {
      throw new HttpException(
        'Rate limit exceeded. Please wait a moment before sending more messages.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    validTimestamps.push(now);
    this.rateLimits.set(userId, validTimestamps);
  }

  /**
   * Persists a plain-text chat message to PostgreSQL after strict authorization.
   * Does NOT broadcast; returns the persisted record.
   */
  async saveMessage(
    activityId: string,
    user: AuthenticatedUser,
    content: string,
  ): Promise<ChatMessage> {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    const trimmed = content.trim();
    if (trimmed.length > 2000) {
      throw new BadRequestException(
        'Message content cannot exceed 2000 characters.',
      );
    }

    // Rate limiting check
    this.checkRateLimit(user.userId);

    // Verify membership authorization
    const member = await this.authorizeMember(activityId, user.userId);

    try {
      const result = await this.database.query<MessageRow>(
        `INSERT INTO activity_messages (activity_id, sender_id, content)
         VALUES ($1, $2, $3)
         RETURNING message_id, activity_id, sender_id, content, created_at`,
        [activityId, member.profileId, trimmed],
      );

      const row = result.rows[0];
      if (!row) {
        throw new InternalServerErrorException(
          'Failed to persist chat message.',
        );
      }

      return {
        messageId: row.message_id,
        activityId: row.activity_id,
        senderId: row.sender_id,
        senderSupabaseUserId: user.userId,
        senderName: member.displayName,
        senderAvatarUrl: member.avatarUrl,
        content: row.content,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Retrieves paginated chronological message history for an activity.
   */
  async getMessages(
    activityId: string,
    user: AuthenticatedUser,
    query: ListMessagesDto,
  ): Promise<ChatHistoryResponse> {
    await this.authorizeMember(activityId, user.userId);

    const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
    const offset = Math.max(0, query.offset ?? 0);

    try {
      const countResult = await this.database.query<{ total: string }>(
        'SELECT COUNT(*)::text AS total FROM activity_messages WHERE activity_id = $1',
        [activityId],
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      let sql = `
        SELECT m.message_id, m.activity_id, m.sender_id, m.content, m.created_at,
               p.supabase_user_id AS sender_supabase_user_id,
               p.display_name AS sender_name,
               p.avatar_url AS sender_avatar_url
        FROM activity_messages m
        JOIN profiles p ON p.user_id = m.sender_id
        WHERE m.activity_id = $1
      `;
      const params: unknown[] = [activityId];

      if (query.before) {
        params.push(query.before);
        sql += ` AND m.created_at < $${params.length}`;
      }

      sql += ` ORDER BY m.created_at ASC, m.message_id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await this.database.query<MessageRow>(sql, params);

      const items: ChatMessage[] = result.rows.map((row) => ({
        messageId: row.message_id,
        activityId: row.activity_id,
        senderId: row.sender_id,
        senderSupabaseUserId: row.sender_supabase_user_id,
        senderName: row.sender_name,
        senderAvatarUrl: row.sender_avatar_url,
        content: row.content,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
      }));

      return {
        items,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + items.length < total,
        },
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string })?.code;
    if (code === '23503' || code === '22P02') {
      throw new NotFoundException('Activity or user not found.');
    }
    throw new InternalServerErrorException(
      'Unable to complete chat operation.',
    );
  }
}
