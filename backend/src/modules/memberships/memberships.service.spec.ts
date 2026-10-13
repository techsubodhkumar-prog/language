import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MembershipsService } from './memberships.service.js';

const host: AuthenticatedUser = { userId: 'host-auth' };
const guest: AuthenticatedUser = { userId: 'guest-auth' };
const activity = {
  activity_id: 'activity-uuid',
  host_user_id: 'host-profile',
  status: 'scheduled',
  starts_at: new Date(Date.now() + 86_400_000),
  max_participants: 2,
  join_policy: 'approval',
  visibility: 'public',
};

function setup(overrides: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown[]]> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push([sql, params]);
      if (sql.includes('FROM activities') && sql.includes('FOR UPDATE'))
        return { rows: [overrides.activity ?? activity], rowCount: 1 };
      if (sql.includes('SELECT user_id FROM profiles'))
        return {
          rows: [
            {
              user_id:
                params[0] === 'host-auth' ? 'host-profile' : 'guest-profile',
            },
          ],
          rowCount: 1,
        };
      if (sql.includes('FROM activity_memberships') && sql.includes('COUNT(*)'))
        return {
          rows: [{ count: Number(overrides.approvedCount ?? 0).toString() }],
          rowCount: 1,
        };
      if (
        sql.includes('FROM activity_memberships') &&
        sql.includes('FOR UPDATE')
      )
        return {
          rows: Object.hasOwn(overrides, 'membership')
            ? overrides.membership
              ? [overrides.membership]
              : []
            : [
                {
                  membership_id: 'membership-uuid',
                  user_id: 'guest-profile',
                  status: 'requested',
                },
              ],
          rowCount: 1,
        };
      if (sql.includes('INSERT INTO activity_memberships'))
        return { rows: [{ membership_id: 'membership-uuid' }], rowCount: 1 };
      if (sql.includes('UPDATE activity_memberships'))
        return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const database = {
    withTransaction: vi.fn(
      async (callback: (client: PoolClient) => Promise<unknown>) =>
        callback(client as unknown as PoolClient),
    ),
    query: vi.fn(),
  };
  return {
    service: new MembershipsService(database as unknown as DatabaseService),
    client,
    database,
    calls,
  };
}

describe('MembershipsService', () => {
  it('creates a pending request from verified identity and locks the activity', async () => {
    const { service, client, calls } = setup({ membership: undefined });
    const result = await service.join('activity-uuid', guest);
    expect(result).toEqual({
      membershipId: 'membership-uuid',
      status: 'requested',
    });
    expect(calls[0][0]).toContain('FOR UPDATE');
    expect(
      client.query.mock.calls.find(([sql]) =>
        sql.includes('SELECT user_id FROM profiles'),
      )?.[1],
    ).toEqual(['guest-auth']);
    expect(
      calls.some(([sql]) => sql.includes('INSERT INTO activity_memberships')),
    ).toBe(true);
  });

  it('rejects duplicate pending requests and host self-join', async () => {
    const duplicate = setup();
    await expect(
      duplicate.service.join('activity-uuid', guest),
    ).rejects.toBeInstanceOf(ConflictException);
    const self = setup({ membership: undefined });
    await expect(
      self.service.join('activity-uuid', host),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects joining a full or unavailable activity', async () => {
    const full = setup({ membership: undefined, approvedCount: 1 });
    await expect(
      full.service.join('activity-uuid', guest),
    ).rejects.toBeInstanceOf(ConflictException);
    const cancelled = setup({ activity: { ...activity, status: 'cancelled' } });
    await expect(
      cancelled.service.join('activity-uuid', guest),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resubmits a rejected request by updating the unique membership row', async () => {
    const { service, calls } = setup({
      membership: {
        membership_id: 'old-membership',
        status: 'rejected',
        user_id: 'guest-profile',
      },
    });
    const result = await service.join('activity-uuid', guest);
    expect(result).toEqual({
      membershipId: 'old-membership',
      status: 'requested',
    });
    expect(
      calls.some(
        ([sql, params]) =>
          sql.includes('UPDATE activity_memberships') &&
          params[0] === 'requested',
      ),
    ).toBe(true);
  });

  it('does not reactivate a host-removed membership', async () => {
    const { service } = setup({
      membership: {
        membership_id: 'removed-membership',
        status: 'removed',
        user_id: 'guest-profile',
      },
    });
    await expect(service.join('activity-uuid', guest)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('approves only host decisions and counts the host once when enforcing capacity', async () => {
    const full = setup({ approvedCount: 1 });
    await expect(
      full.service.decide('activity-uuid', 'membership-uuid', host, 'approved'),
    ).rejects.toBeInstanceOf(ConflictException);
    const allowed = setup({ approvedCount: 0 });
    await expect(
      allowed.service.decide(
        'activity-uuid',
        'membership-uuid',
        host,
        'approved',
      ),
    ).resolves.toEqual({ membershipId: 'membership-uuid', status: 'approved' });
    const wrongHost = setup();
    await expect(
      wrongHost.service.decide(
        'activity-uuid',
        'membership-uuid',
        guest,
        'rejected',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects non-pending status transitions', async () => {
    const { service } = setup({
      membership: {
        membership_id: 'membership-uuid',
        user_id: 'guest-profile',
        status: 'approved',
      },
    });
    await expect(
      service.decide('activity-uuid', 'membership-uuid', host, 'rejected'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the host to reject a pending request', async () => {
    const { service, calls } = setup();
    await expect(
      service.decide('activity-uuid', 'membership-uuid', host, 'rejected'),
    ).resolves.toEqual({ membershipId: 'membership-uuid', status: 'rejected' });
    expect(
      calls.some(
        ([sql, params]) =>
          sql.includes('UPDATE activity_memberships') &&
          params[0] === 'rejected',
      ),
    ).toBe(true);
  });

  it('auto-joins when policy allows and keeps the host as the first participant', async () => {
    const { service, calls } = setup({
      activity: { ...activity, join_policy: 'auto_join' },
      membership: undefined,
    });
    await expect(service.join('activity-uuid', guest)).resolves.toEqual({
      membershipId: 'membership-uuid',
      status: 'approved',
    });
    expect(calls.find(([sql]) => sql.includes('COUNT(*)'))?.[1]).toEqual([
      'activity-uuid',
    ]);
  });

  it('returns the host with approved guests and protects the participant list', async () => {
    const { service, database } = setup();
    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            host_user_id: 'host-profile',
            max_participants: 2,
            host_name: 'Sam',
            host_supabase_user_id: 'host-auth',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ membershipId: 'guest-1', displayName: 'Riya' }],
        rowCount: 1,
      });
    await expect(
      service.participants('activity-uuid', host),
    ).resolves.toMatchObject({
      total: 2,
      remaining: 0,
      items: [
        { displayName: 'Sam', role: 'host' },
        { displayName: 'Riya', role: 'participant' },
      ],
    });

    const denied = setup();
    denied.database.query
      .mockResolvedValueOnce({
        rows: [
          {
            host_user_id: 'host-profile',
            max_participants: 2,
            host_name: 'Sam',
            host_supabase_user_id: 'host-auth',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      denied.service.participants('activity-uuid', guest),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
