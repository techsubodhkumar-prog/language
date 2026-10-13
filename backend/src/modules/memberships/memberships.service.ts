import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow, PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

interface ActivityLock extends QueryResultRow {
  activity_id: string;
  host_user_id: string;
  status: string;
  starts_at: Date | string;
  max_participants: number;
  join_policy: string;
  visibility: string;
}

@Injectable()
export class MembershipsService {
  constructor(private readonly database: DatabaseService) {}

  private async profileId(client: PoolClient, subject: string) {
    const result = await client.query<{ user_id: string }>(
      'SELECT user_id FROM profiles WHERE supabase_user_id = $1',
      [subject],
    );
    if (!result.rows[0]) throw new NotFoundException('User profile not found.');
    return result.rows[0].user_id;
  }

  private async lockActivity(
    client: PoolClient,
    id: string,
  ): Promise<ActivityLock> {
    const result = await client.query<ActivityLock>(
      `SELECT activity_id, host_user_id, status, starts_at, max_participants,
              join_policy, visibility
       FROM activities WHERE activity_id = $1 FOR UPDATE`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Activity not found.');
    return result.rows[0];
  }

  private ensureAvailable(activity: ActivityLock) {
    if (
      activity.status !== 'scheduled' ||
      new Date(activity.starts_at).getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'This activity is no longer accepting participants.',
      );
    }
  }

  async join(activityId: string, user: AuthenticatedUser) {
    return this.database.withTransaction(async (client) => {
      const activity = await this.lockActivity(client, activityId);
      this.ensureAvailable(activity);
      const profileId = await this.profileId(client, user.userId);
      if (activity.host_user_id === profileId)
        throw new ConflictException('The activity host is already included.');
      if (activity.visibility !== 'public')
        throw new NotFoundException('Activity not found.');

      const old = await client.query<{ membership_id: string; status: string }>(
        'SELECT membership_id, status FROM activity_memberships WHERE activity_id = $1 AND user_id = $2 FOR UPDATE',
        [activityId, profileId],
      );
      const previous = old.rows[0];
      if (previous?.status === 'requested' || previous?.status === 'approved') {
        throw new ConflictException(
          previous.status === 'approved'
            ? 'You already joined this activity.'
            : 'A join request is already pending.',
        );
      }
      if (
        previous &&
        !['rejected', 'withdrawn', 'left'].includes(previous.status)
      ) {
        throw new ConflictException('This membership cannot be resubmitted.');
      }

      const count = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM activity_memberships WHERE activity_id = $1 AND status = 'approved'",
        [activityId],
      );
      const total = 1 + Number(count.rows[0]?.count ?? 0);
      if (total >= activity.max_participants)
        throw new ConflictException('This activity is full.');

      const autoJoin = activity.join_policy === 'auto_join';
      if (previous) {
        await client.query(
          `UPDATE activity_memberships SET status = $1, requested_at = NOW(),
           decided_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END, updated_at = NOW()
           WHERE membership_id = $2`,
          [autoJoin ? 'approved' : 'requested', previous.membership_id],
        );
        return {
          membershipId: previous.membership_id,
          status: autoJoin ? 'approved' : 'requested',
        };
      }
      const result = await client.query<{ membership_id: string }>(
        `INSERT INTO activity_memberships(activity_id, user_id, status, decided_at)
         VALUES ($1, $2, $3, CASE WHEN $3 = 'approved' THEN NOW() ELSE NULL END)
         RETURNING membership_id`,
        [activityId, profileId, autoJoin ? 'approved' : 'requested'],
      );
      return {
        membershipId: result.rows[0].membership_id,
        status: autoJoin ? 'approved' : 'requested',
      };
    });
  }

  async mine(user: AuthenticatedUser) {
    try {
      const result = await this.database.query(
        `SELECT m.membership_id AS "membershipId", m.activity_id AS "activityId", m.status,
                m.requested_at AS "requestedAt", m.decided_at AS "decidedAt",
                a.title AS "activityTitle", a.starts_at AS "startsAt"
         FROM activity_memberships m JOIN profiles p ON p.user_id = m.user_id
         JOIN activities a ON a.activity_id = m.activity_id
         WHERE p.supabase_user_id = $1 ORDER BY m.updated_at DESC`,
        [user.userId],
      );
      return { items: result.rows };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async current(activityId: string, user: AuthenticatedUser) {
    try {
      const result = await this.database.query(
        `SELECT m.membership_id AS "membershipId", m.status, m.requested_at AS "requestedAt", m.decided_at AS "decidedAt"
         FROM activity_memberships m JOIN profiles p ON p.user_id=m.user_id
         WHERE m.activity_id=$1 AND p.supabase_user_id=$2`,
        [activityId, user.userId],
      );
      return result.rows[0] ?? { status: 'none' };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async withdraw(activityId: string, user: AuthenticatedUser) {
    return this.database.withTransaction(async (client) => {
      await this.lockActivity(client, activityId);
      const profileId = await this.profileId(client, user.userId);
      const result = await client.query(
        `UPDATE activity_memberships SET status = CASE WHEN status='requested' THEN 'withdrawn' ELSE 'left' END,
         decided_at=NOW(), updated_at=NOW()
         WHERE activity_id=$1 AND user_id=$2 AND status IN ('requested','approved')
         RETURNING membership_id AS "membershipId", status`,
        [activityId, profileId],
      );
      if (!result.rows[0])
        throw new ConflictException(
          'There is no active request or membership to withdraw.',
        );
      return result.rows[0];
    });
  }

  async requests(activityId: string, user: AuthenticatedUser) {
    try {
      const access = await this.database.query(
        `SELECT 1 FROM activities a JOIN profiles p ON p.user_id=a.host_user_id
         WHERE a.activity_id=$1 AND p.supabase_user_id=$2`,
        [activityId, user.userId],
      );
      if (!access.rowCount)
        throw new ForbiddenException(
          'Only the activity host can view requests.',
        );
      const result = await this.database.query(
        `SELECT m.membership_id AS "membershipId", m.status, m.requested_at AS "requestedAt",
                p.display_name AS "displayName", p.avatar_url AS "avatarUrl"
         FROM activity_memberships m JOIN profiles p ON p.user_id=m.user_id
         WHERE m.activity_id=$1 AND m.status='requested' ORDER BY m.requested_at, m.membership_id`,
        [activityId],
      );
      return { items: result.rows };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async decide(
    activityId: string,
    membershipId: string,
    user: AuthenticatedUser,
    decision: 'approved' | 'rejected',
  ) {
    return this.database.withTransaction(async (client) => {
      const activity = await this.lockActivity(client, activityId);
      const hostId = await this.profileId(client, user.userId);
      if (activity.host_user_id !== hostId)
        throw new ForbiddenException(
          'Only the activity host can manage requests.',
        );
      if (decision === 'approved') this.ensureAvailable(activity);
      const member = await client.query<{
        membership_id: string;
        user_id: string;
        status: string;
      }>(
        'SELECT membership_id, user_id, status FROM activity_memberships WHERE membership_id=$1 AND activity_id=$2 FOR UPDATE',
        [membershipId, activityId],
      );
      if (!member.rows[0])
        throw new NotFoundException('Join request not found.');
      if (member.rows[0].status !== 'requested')
        throw new ConflictException('Only pending requests can be decided.');
      if (member.rows[0].user_id === hostId)
        throw new ConflictException(
          'The host cannot approve their own request.',
        );
      if (decision === 'approved') {
        const count = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM activity_memberships WHERE activity_id=$1 AND status='approved'",
          [activityId],
        );
        if (1 + Number(count.rows[0]?.count ?? 0) >= activity.max_participants)
          throw new ConflictException('This activity is full.');
      }
      await client.query(
        'UPDATE activity_memberships SET status=$1, decided_at=NOW(), updated_at=NOW() WHERE membership_id=$2',
        [decision, membershipId],
      );
      return { membershipId, status: decision };
    });
  }

  async participants(activityId: string, user: AuthenticatedUser) {
    try {
      const activityResult = await this.database.query<{
        host_user_id: string;
        max_participants: number;
        host_name: string;
        host_supabase_user_id: string;
      }>(
        `SELECT a.host_user_id, a.max_participants, p.display_name AS host_name, p.supabase_user_id AS host_supabase_user_id
         FROM activities a JOIN profiles p ON p.user_id=a.host_user_id WHERE a.activity_id=$1`,
        [activityId],
      );
      const activity = activityResult.rows[0];
      if (!activity) throw new NotFoundException('Activity not found.');
      const isHost = activity.host_supabase_user_id === user.userId;
      const access = isHost
        ? true
        : await this.database
            .query(
              `SELECT 1 FROM activity_memberships m JOIN profiles p ON p.user_id=m.user_id
         WHERE m.activity_id=$1 AND m.status='approved' AND p.supabase_user_id=$2`,
              [activityId, user.userId],
            )
            .then((r) => Boolean(r.rowCount));
      if (!access)
        throw new ForbiddenException(
          'Only the host and approved participants can view participants.',
        );
      const guests = await this.database.query(
        `SELECT m.membership_id AS "membershipId", p.display_name AS "displayName", p.avatar_url AS "avatarUrl"
         FROM activity_memberships m JOIN profiles p ON p.user_id=m.user_id
         WHERE m.activity_id=$1 AND m.status='approved' ORDER BY m.decided_at, m.membership_id`,
        [activityId],
      );
      const total = 1 + guests.rows.length;
      return {
        items: [
          { displayName: activity.host_name, role: 'host' },
          ...guests.rows.map((row) => ({ ...row, role: 'participant' })),
        ],
        capacity: activity.max_participants,
        total,
        remaining: Math.max(0, activity.max_participants - total),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string }).code;
    if (code === '23503' || code === '22P02')
      throw new NotFoundException('Activity or user not found.');
    if (code === '23505')
      throw new ConflictException(
        'A membership already exists for this activity.',
      );
    throw new InternalServerErrorException(
      'Unable to complete the membership request.',
    );
  }
}
