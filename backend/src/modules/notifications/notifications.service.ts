import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { FcmPushService } from './fcm-push.service.js';
import type { ListNotificationsDto } from './dto/list-notifications.dto.js';
import type {
  NotificationListResponse,
  NotificationRecord,
  NotificationType,
  UnreadCountResponse,
} from './notifications.types.js';

interface RawNotificationRow extends QueryResultRow {
  notification_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  message: string;
  activity_id: string | null;
  reference_id: string | null;
  data: Record<string, unknown> | string;
  read_at: Date | string | null;
  created_at: Date | string;
}

export interface CreateNotificationOptions {
  recipientProfileId: string;
  type: NotificationType;
  title: string;
  message: string;
  activityId?: string | null;
  referenceId?: string | null;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly fcmPushService: FcmPushService,
  ) {}

  async getProfileId(
    supabaseUserId: string,
    client?: PoolClient,
  ): Promise<string> {
    const runner = client
      ? (text: string, params: unknown[]) => client.query(text, params)
      : (text: string, params: unknown[]) => this.database.query(text, params);

    const res = await runner(
      'SELECT user_id FROM profiles WHERE supabase_user_id = $1',
      [supabaseUserId],
    );
    if (!res.rows[0]) throw new NotFoundException('User profile not found.');
    return (res.rows[0] as { user_id: string }).user_id;
  }

  private mapRow(row: RawNotificationRow): NotificationRecord {
    let parsedData: Record<string, unknown> = {};
    if (typeof row.data === 'string') {
      try {
        parsedData = JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        parsedData = {};
      }
    } else if (row.data && typeof row.data === 'object') {
      parsedData = row.data;
    }

    const readAtIso = row.read_at
      ? row.read_at instanceof Date
        ? row.read_at.toISOString()
        : new Date(row.read_at).toISOString()
      : null;

    const createdAtIso =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();

    return {
      notificationId: row.notification_id,
      recipientId: row.recipient_id,
      type: row.type,
      title: row.title,
      message: row.message,
      activityId: row.activity_id,
      referenceId: row.reference_id,
      data: parsedData,
      readAt: readAtIso,
      createdAt: createdAtIso,
      isRead: readAtIso !== null,
    };
  }

  /**
   * Persists a notification to the database and dispatches a background push.
   */
  async createNotification(
    options: CreateNotificationOptions,
    client?: PoolClient,
  ): Promise<NotificationRecord> {
    const {
      recipientProfileId,
      type,
      title,
      message,
      activityId = null,
      referenceId = null,
      data = {},
    } = options;

    const runner = client
      ? <T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[]) => client.query<T>(text, params)
      : <T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[]) => this.database.query<T>(text, params);

    const res = await runner<RawNotificationRow>(
      `INSERT INTO notifications (recipient_id, type, title, message, activity_id, reference_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING notification_id, recipient_id, type, title, message, activity_id, reference_id, data, read_at, created_at`,
      [
        recipientProfileId,
        type,
        title,
        message,
        activityId,
        referenceId,
        JSON.stringify(data),
      ],
    );

    const record = this.mapRow(res.rows[0]);

    // Asynchronously dispatch FCM push without blocking caller
    this.fcmPushService
      .sendToUser(recipientProfileId, {
        title,
        body: message,
        data: {
          type,
          activityId: activityId ?? '',
          notificationId: record.notificationId,
        },
      })
      .catch((err) => {
        this.logger.warn(`Push notification send failed: ${err.message}`);
      });

    return record;
  }

  /**
   * Lists notifications for authenticated user with pagination and recipient isolation.
   */
  async listNotifications(
    user: AuthenticatedUser,
    query: ListNotificationsDto,
  ): Promise<NotificationListResponse> {
    const profileId = await this.getProfileId(user.userId);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const offset = Math.max(0, query.offset ?? 0);
    const unreadOnly = Boolean(query.unreadOnly);

    try {
      const unreadCountRes = await this.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
        [profileId],
      );
      const unreadCount = Number(unreadCountRes.rows[0]?.count ?? 0);

      let countSql =
        'SELECT COUNT(*)::text AS total FROM notifications WHERE recipient_id = $1';
      const countParams: unknown[] = [profileId];
      if (unreadOnly) {
        countSql += ' AND read_at IS NULL';
      }
      const totalRes = await this.database.query<{ total: string }>(
        countSql,
        countParams,
      );
      const total = Number(totalRes.rows[0]?.total ?? 0);

      let selectSql = `
        SELECT notification_id, recipient_id, type, title, message, activity_id, reference_id, data, read_at, created_at
        FROM notifications
        WHERE recipient_id = $1
      `;
      const selectParams: unknown[] = [profileId];
      if (unreadOnly) {
        selectSql += ' AND read_at IS NULL';
      }
      selectSql += ` ORDER BY created_at DESC, notification_id DESC LIMIT $${selectParams.length + 1} OFFSET $${selectParams.length + 2}`;
      selectParams.push(limit, offset);

      const itemsRes = await this.database.query<RawNotificationRow>(
        selectSql,
        selectParams,
      );
      const items = itemsRes.rows.map((row) => this.mapRow(row));

      return {
        items,
        unreadCount,
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

  /**
   * Returns unread notification count for authenticated user.
   */
  async getUnreadCount(user: AuthenticatedUser): Promise<UnreadCountResponse> {
    const profileId = await this.getProfileId(user.userId);
    try {
      const res = await this.database.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
        [profileId],
      );
      return { unreadCount: Number(res.rows[0]?.count ?? 0) };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Marks a single notification as read if owned by user.
   */
  async markAsRead(
    notificationId: string,
    user: AuthenticatedUser,
  ): Promise<NotificationRecord> {
    const profileId = await this.getProfileId(user.userId);
    try {
      const res = await this.database.query<RawNotificationRow>(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, NOW())
         WHERE notification_id = $1 AND recipient_id = $2
         RETURNING notification_id, recipient_id, type, title, message, activity_id, reference_id, data, read_at, created_at`,
        [notificationId, profileId],
      );

      if (!res.rows[0]) {
        throw new NotFoundException(
          'Notification not found or access restricted.',
        );
      }

      return this.mapRow(res.rows[0]);
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Marks all unread notifications for authenticated user as read.
   */
  async markAllAsRead(
    user: AuthenticatedUser,
  ): Promise<{ updatedCount: number }> {
    const profileId = await this.getProfileId(user.userId);
    try {
      const res = await this.database.query(
        'UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL',
        [profileId],
      );
      return { updatedCount: res.rowCount ?? 0 };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Dismisses (deletes) a notification owned by authenticated user.
   */
  async dismiss(
    notificationId: string,
    user: AuthenticatedUser,
  ): Promise<{ notificationId: string; dismissed: boolean }> {
    const profileId = await this.getProfileId(user.userId);
    try {
      const res = await this.database.query(
        'DELETE FROM notifications WHERE notification_id = $1 AND recipient_id = $2',
        [notificationId, profileId],
      );

      if ((res.rowCount ?? 0) === 0) {
        throw new NotFoundException(
          'Notification not found or access restricted.',
        );
      }

      return { notificationId, dismissed: true };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Registers/updates an FCM device token for authenticated user.
   */
  async registerDeviceToken(
    user: AuthenticatedUser,
    token: string,
    deviceType = 'android',
  ): Promise<{ registered: boolean }> {
    const profileId = await this.getProfileId(user.userId);
    try {
      await this.database.query(
        `INSERT INTO user_device_tokens (user_id, fcm_token, device_type, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (fcm_token)
         DO UPDATE SET user_id = EXCLUDED.user_id, device_type = EXCLUDED.device_type, updated_at = NOW()`,
        [profileId, token, deviceType],
      );
      return { registered: true };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Removes an FCM device token.
   */
  async removeDeviceToken(
    user: AuthenticatedUser,
    token: string,
  ): Promise<{ removed: boolean }> {
    const profileId = await this.getProfileId(user.userId);
    try {
      await this.database.query(
        'DELETE FROM user_device_tokens WHERE user_id = $1 AND fcm_token = $2',
        [profileId, token],
      );
      return { removed: true };
    } catch (error) {
      this.rethrow(error);
    }
  }

  /**
   * Processes upcoming activity reminders:
   * Finds scheduled activities starting in the next 24 hours.
   * Sends an idempotent reminder notification to the host and approved participants.
   * Never sends reminders for cancelled or past activities.
   */
  async processUpcomingReminders(): Promise<{
    sentCount: number;
    skippedCount: number;
  }> {
    let sentCount = 0;
    let skippedCount = 0;

    try {
      // Find activities starting in next 24 hours that are still scheduled
      const activitiesRes = await this.database.query<{
        activity_id: string;
        title: string;
        host_user_id: string;
        starts_at: Date;
      }>(
        `SELECT activity_id, title, host_user_id, starts_at
         FROM activities
         WHERE status = 'scheduled'
           AND starts_at > NOW()
           AND starts_at <= NOW() + INTERVAL '24 hours'`,
      );

      for (const act of activitiesRes.rows) {
        // Collect recipients: host + approved guests
        const guestsRes = await this.database.query<{ user_id: string }>(
          "SELECT user_id FROM activity_memberships WHERE activity_id = $1 AND status = 'approved'",
          [act.activity_id],
        );

        const recipients = [
          act.host_user_id,
          ...guestsRes.rows.map((g) => g.user_id),
        ];

        for (const recipientId of recipients) {
          const res = await this.database.query(
            `INSERT INTO notifications (recipient_id, type, title, message, activity_id, data)
             VALUES ($1, 'activity_reminder', $2, $3, $4, $5::jsonb)
             ON CONFLICT (activity_id, recipient_id, type) WHERE type = 'activity_reminder'
             DO NOTHING`,
            [
              recipientId,
              `Reminder: ${act.title}`,
              `Your activity "${act.title}" is coming up soon. Check details and coordinate with your group!`,
              act.activity_id,
              JSON.stringify({ startsAt: act.starts_at }),
            ],
          );

          if ((res.rowCount ?? 0) > 0) {
            sentCount++;
          } else {
            skippedCount++;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Error processing reminders: ${error.message}`);
    }

    return { sentCount, skippedCount };
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string })?.code;
    if (code === '23503' || code === '22P02') {
      throw new NotFoundException('Resource not found.');
    }
    throw new InternalServerErrorException(
      'Unable to complete notification request.',
    );
  }
}
