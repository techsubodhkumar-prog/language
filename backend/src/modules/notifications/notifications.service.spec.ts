import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { NotificationsService } from './notifications.service.js';
import { FcmPushService } from './fcm-push.service.js';

const mockUser: AuthenticatedUser = { userId: 'auth-user-1' };
const otherUser: AuthenticatedUser = { userId: 'auth-user-2' };

function createMockDatabase(_overrides: Record<string, unknown> = {}) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT user_id FROM profiles')) {
      if (params[0] === 'auth-user-1') {
        return { rows: [{ user_id: 'prof-user-1' }], rowCount: 1 };
      }
      if (params[0] === 'auth-user-2') {
        return { rows: [{ user_id: 'prof-user-2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('INSERT INTO notifications')) {
      return {
        rows: [
          {
            notification_id: 'notif-1',
            recipient_id: params[0],
            type: params[1],
            title: params[2],
            message: params[3],
            activity_id: params[4],
            reference_id: params[5],
            data: params[6],
            read_at: null,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('SELECT COUNT(*)::text AS count FROM notifications')) {
      return { rows: [{ count: '3' }], rowCount: 1 };
    }

    if (sql.includes('SELECT COUNT(*)::text AS total FROM notifications')) {
      return { rows: [{ total: '5' }], rowCount: 1 };
    }

    if (sql.includes('FROM notifications') && sql.includes('SELECT notification_id')) {
      return {
        rows: [
          {
            notification_id: 'notif-1',
            recipient_id: 'prof-user-1',
            type: 'join_request',
            title: 'New Request',
            message: 'Someone wants to join',
            activity_id: 'act-1',
            reference_id: 'mem-1',
            data: {},
            read_at: null,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('UPDATE notifications') && sql.includes('SET read_at = COALESCE')) {
      if (params[0] === 'notif-1' && params[1] === 'prof-user-1') {
        return {
          rows: [
            {
              notification_id: 'notif-1',
              recipient_id: 'prof-user-1',
              type: 'join_request',
              title: 'New Request',
              message: 'Someone wants to join',
              activity_id: 'act-1',
              reference_id: 'mem-1',
              data: {},
              read_at: new Date(),
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('UPDATE notifications') && sql.includes('SET read_at = NOW()')) {
      return { rowCount: 3 };
    }

    if (sql.includes('DELETE FROM notifications')) {
      if (params[0] === 'notif-1' && params[1] === 'prof-user-1') {
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    }

    if (sql.includes('INSERT INTO user_device_tokens')) {
      return { rowCount: 1 };
    }

    if (sql.includes('DELETE FROM user_device_tokens')) {
      return { rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  return { query } as unknown as DatabaseService;
}

describe('NotificationsService', () => {
  it('creates persistent notification and dispatches push safely', async () => {
    const db = createMockDatabase();
    const sendToUser = vi.fn().mockResolvedValue({ sent: 1, failed: 0, tokensRemoved: 0 });
    const fcm = { sendToUser } as unknown as FcmPushService;

    const service = new NotificationsService(db, fcm);

    const record = await service.createNotification({
      recipientProfileId: 'prof-user-1',
      type: 'join_request',
      title: 'New Join Request',
      message: 'Someone requested to join your activity.',
      activityId: 'act-1',
    });

    expect(record.notificationId).toBe('notif-1');
    expect(record.recipientId).toBe('prof-user-1');
    expect(record.type).toBe('join_request');
    expect(record.isRead).toBe(false);
    expect(sendToUser).toHaveBeenCalledWith(
      'prof-user-1',
      expect.objectContaining({ title: 'New Join Request' }),
    );
  });

  it('lists notifications for authenticated user with unread count and pagination', async () => {
    const db = createMockDatabase();
    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const result = await service.listNotifications(mockUser, { limit: 10, offset: 0 });

    expect(result.unreadCount).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].notificationId).toBe('notif-1');
    expect(result.pagination.total).toBe(5);
  });

  it('marks a single notification as read if owned by the user', async () => {
    const db = createMockDatabase();
    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const updated = await service.markAsRead('notif-1', mockUser);
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).toBeDefined();

    // Rejects if user does not own notification
    await expect(service.markAsRead('notif-1', otherUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks all unread notifications as read', async () => {
    const db = createMockDatabase();
    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const result = await service.markAllAsRead(mockUser);
    expect(result.updatedCount).toBe(3);
  });

  it('dismisses a notification owned by the user', async () => {
    const db = createMockDatabase();
    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const result = await service.dismiss('notif-1', mockUser);
    expect(result.dismissed).toBe(true);

    // Rejects unauthorized dismissal
    await expect(service.dismiss('notif-1', otherUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('registers and removes device tokens safely', async () => {
    const db = createMockDatabase();
    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const reg = await service.registerDeviceToken(mockUser, 'fcm-token-123', 'android');
    expect(reg.registered).toBe(true);

    const rem = await service.removeDeviceToken(mockUser, 'fcm-token-123');
    expect(rem.removed).toBe(true);
  });

  it('processes upcoming reminders idempotently and ignores cancelled activities', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push([sql, params]);
        if (sql.includes('FROM activities')) {
          return {
            rows: [
              {
                activity_id: 'act-scheduled',
                title: 'Morning Yoga',
                host_user_id: 'host-1',
                starts_at: new Date(Date.now() + 3600000),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM activity_memberships WHERE activity_id')) {
          return {
            rows: [{ user_id: 'guest-1' }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO notifications')) {
          // Return rowCount 1 for first, 0 for second (duplicate)
          return { rowCount: calls.filter((c) => c[0].includes('INSERT INTO notifications')).length === 1 ? 1 : 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as DatabaseService;

    const fcm = {} as FcmPushService;
    const service = new NotificationsService(db, fcm);

    const result = await service.processUpcomingReminders();

    // Verify activity query strictly requires status = 'scheduled' and starts_at in 24 hours
    const actQuery = calls.find((c) => c[0].includes('FROM activities'))?.[0] ?? '';
    expect(actQuery).toContain("status = 'scheduled'");
    expect(actQuery).toContain("INTERVAL '24 hours'");

    // Reminders were attempted for both host and guest
    expect(result.sentCount + result.skippedCount).toBe(2);
  });
});
