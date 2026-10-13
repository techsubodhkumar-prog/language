import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ChatService } from './chat.service.js';

const hostUser: AuthenticatedUser = { userId: 'host-auth-id' };
const approvedUser: AuthenticatedUser = { userId: 'approved-auth-id' };
const pendingUser: AuthenticatedUser = { userId: 'pending-auth-id' };
const outsiderUser: AuthenticatedUser = { userId: 'outsider-auth-id' };

const activityId = 'activity-0000-0000-0000-000000000001';

function setupChat(overrides: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown[]]> = [];

  const database = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push([sql, params]);

      // Activity lookup
      if (sql.includes('FROM activities WHERE activity_id')) {
        if (overrides.activityMissing) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              activity_id: activityId,
              host_user_id: 'host-profile-id',
              status: 'scheduled',
            },
          ],
          rowCount: 1,
        };
      }

      // Profile lookup
      if (sql.includes('FROM profiles WHERE supabase_user_id')) {
        const sub = params[0];
        if (overrides.profileMissing) {
          return { rows: [], rowCount: 0 };
        }
        if (sub === 'host-auth-id') {
          return {
            rows: [
              {
                user_id: 'host-profile-id',
                display_name: 'Host User',
                avatar_url: 'https://example.com/host.jpg',
              },
            ],
            rowCount: 1,
          };
        }
        if (sub === 'approved-auth-id') {
          return {
            rows: [
              {
                user_id: 'approved-profile-id',
                display_name: 'Approved Member',
                avatar_url: null,
              },
            ],
            rowCount: 1,
          };
        }
        if (sub === 'pending-auth-id') {
          return {
            rows: [
              {
                user_id: 'pending-profile-id',
                display_name: 'Pending Member',
                avatar_url: null,
              },
            ],
            rowCount: 1,
          };
        }
        return {
          rows: [
            {
              user_id: 'outsider-profile-id',
              display_name: 'Outsider User',
              avatar_url: null,
            },
          ],
          rowCount: 1,
        };
      }

      // Membership lookup
      if (sql.includes('FROM activity_memberships WHERE activity_id')) {
        const profileId = params[1];
        if (profileId === 'approved-profile-id') {
          return {
            rows: [{ status: 'approved' }],
            rowCount: 1,
          };
        }
        if (profileId === 'pending-profile-id') {
          return {
            rows: [{ status: 'requested' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }

      // Insert message
      if (sql.includes('INSERT INTO activity_messages')) {
        if (overrides.dbError) {
          throw new Error('Database connection dropped');
        }
        return {
          rows: [
            {
              message_id: 'msg-uuid-1234',
              activity_id: activityId,
              sender_id: params[1],
              content: params[2],
              created_at: new Date('2026-10-13T12:00:00Z'),
            },
          ],
          rowCount: 1,
        };
      }

      // Count messages
      if (sql.includes('SELECT COUNT(*)::text AS total FROM activity_messages')) {
        const countVal = typeof overrides.messageTotal === 'number' ? overrides.messageTotal.toString() : '2';
        return {
          rows: [{ total: countVal }],
          rowCount: 1,
        };
      }

      // List messages
      if (sql.includes('FROM activity_messages m')) {
        return {
          rows: [
            {
              message_id: 'msg-1',
              activity_id: activityId,
              sender_id: 'host-profile-id',
              content: 'Welcome to the group!',
              created_at: new Date('2026-10-13T10:00:00Z'),
              sender_supabase_user_id: 'host-auth-id',
              sender_name: 'Host User',
              sender_avatar_url: 'https://example.com/host.jpg',
            },
            {
              message_id: 'msg-2',
              activity_id: activityId,
              sender_id: 'approved-profile-id',
              content: 'Excited to join!',
              created_at: new Date('2026-10-13T10:05:00Z'),
              sender_supabase_user_id: 'approved-auth-id',
              sender_name: 'Approved Member',
              sender_avatar_url: null,
            },
          ],
          rowCount: 2,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };

  const service = new ChatService(database as unknown as DatabaseService);
  return { service, database, calls };
}

describe('ChatService', () => {
  describe('authorizeMember', () => {
    it('authorizes the activity host through activity ownership', async () => {
      const { service } = setupChat();
      const auth = await service.authorizeMember(activityId, hostUser.userId);
      expect(auth).toEqual({
        profileId: 'host-profile-id',
        displayName: 'Host User',
        avatarUrl: 'https://example.com/host.jpg',
        isHost: true,
      });
    });

    it('authorizes an approved participant', async () => {
      const { service } = setupChat();
      const auth = await service.authorizeMember(activityId, approvedUser.userId);
      expect(auth).toEqual({
        profileId: 'approved-profile-id',
        displayName: 'Approved Member',
        avatarUrl: null,
        isHost: false,
      });
    });

    it('denies chat access to a pending participant', async () => {
      const { service } = setupChat();
      await expect(
        service.authorizeMember(activityId, pendingUser.userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies chat access to an outsider or unapproved user', async () => {
      const { service } = setupChat();
      await expect(
        service.authorizeMember(activityId, outsiderUser.userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when activity does not exist', async () => {
      const { service } = setupChat({ activityMissing: true });
      await expect(
        service.authorizeMember(activityId, hostUser.userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user profile does not exist', async () => {
      const { service } = setupChat({ profileMissing: true });
      await expect(
        service.authorizeMember(activityId, hostUser.userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveMessage', () => {
    it('persists message in PostgreSQL with verified sender identity and server timestamps', async () => {
      const { service, calls } = setupChat();
      const message = await service.saveMessage(
        activityId,
        approvedUser,
        '  Looking forward to tomorrow!  ',
      );

      expect(message).toEqual({
        messageId: 'msg-uuid-1234',
        activityId,
        senderId: 'approved-profile-id',
        senderSupabaseUserId: 'approved-auth-id',
        senderName: 'Approved Member',
        senderAvatarUrl: null,
        content: 'Looking forward to tomorrow!',
        createdAt: '2026-10-13T12:00:00.000Z',
      });

      const insertCall = calls.find(([sql]) =>
        sql.includes('INSERT INTO activity_messages'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual([
        activityId,
        'approved-profile-id',
        'Looking forward to tomorrow!',
      ]);
    });

    it('rejects empty or whitespace-only messages', async () => {
      const { service } = setupChat();
      await expect(service.saveMessage(activityId, hostUser, '   ')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.saveMessage(activityId, hostUser, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects oversized messages exceeding 2000 characters', async () => {
      const { service } = setupChat();
      const oversized = 'a'.repeat(2001);
      await expect(service.saveMessage(activityId, hostUser, oversized)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does not succeed if database write fails', async () => {
      const { service } = setupChat({ dbError: true });
      await expect(
        service.saveMessage(activityId, hostUser, 'Valid content'),
      ).rejects.toThrow();
    });

    it('enforces rate limiting on rapid flooding of messages', async () => {
      const { service } = setupChat();
      // Send 10 messages successfully
      for (let i = 0; i < 10; i++) {
        await service.saveMessage(activityId, hostUser, `Message #${i}`);
      }
      // 11th message in quick succession should be rejected with 429
      await expect(
        service.saveMessage(activityId, hostUser, '11th rapid message'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getMessages', () => {
    it('retrieves chronological messages for an authorized member', async () => {
      const { service } = setupChat();
      const result = await service.getMessages(activityId, hostUser, {
        limit: 50,
        offset: 0,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].content).toBe('Welcome to the group!');
      expect(result.items[1].content).toBe('Excited to join!');
      expect(result.pagination).toEqual({
        limit: 50,
        offset: 0,
        total: 2,
        hasMore: false,
      });
    });

    it('rejects message history retrieval for unapproved users', async () => {
      const { service } = setupChat();
      await expect(
        service.getMessages(activityId, pendingUser, { limit: 50, offset: 0 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
