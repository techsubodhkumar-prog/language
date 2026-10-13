import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActivityDto } from './dto/create-activity.dto.js';

const user: AuthenticatedUser = { userId: 'auth-user-1' };
const activityRow = {
  activity_id: 'c0a80101-0000-4000-8000-000000000001',
  host_user_id: 'profile-1',
  host_supabase_user_id: 'auth-user-1',
  host_name: 'Sam',
  title: 'Morning cricket',
  description: 'Friendly game',
  category_id: 'cricket',
  category_name: 'Cricket',
  location_name: 'Central Park',
  location_description: 'Main entrance',
  starts_at: new Date(Date.now() + 86400000),
  ends_at: null,
  min_participants: 1,
  max_participants: 6,
  estimated_cost: null,
  visibility: 'public',
  join_policy: 'approval',
  status: 'scheduled',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ActivitiesService', () => {
  let database: {
    query: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  let service: ActivitiesService;
  beforeEach(() => {
    database = { query: vi.fn(), withTransaction: vi.fn() };
    service = new ActivitiesService(database as unknown as DatabaseService);
  });

  it('creates an activity with host identity taken from the verified user', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [{ interest_id: 'cricket' }] })
      .mockResolvedValueOnce({
        rows: [{ activity_id: activityRow.activity_id }],
      })
      .mockResolvedValueOnce({ rows: [activityRow] });
    const result = await service.create(user, {
      title: 'Morning cricket',
      description: 'Friendly game',
      categoryId: 'cricket',
      locationName: 'Central Park',
      locationDescription: 'Main entrance',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      maxParticipants: 6,
    });
    expect(result.isHost).toBe(true);
    const insertion = database.query.mock.calls[2];
    expect(insertion[0]).toContain('host_user_id');
    expect(insertion[1][0]).toBe('profile-1');
    expect(insertion[1]).not.toContain('client-host-id');
    expect(insertion[1][10]).toBe(1);
    expect(insertion[1][11]).toBe(6); // total capacity, including host
  });

  it('rejects invalid capacity and times before writing', async () => {
    await expect(
      service.create(user, {
        title: 'A',
        description: 'x',
        categoryId: 'cricket',
        locationName: 'Park',
        locationDescription: 'Gate',
        startsAt: new Date(Date.now() + 60000).toISOString(),
        maxParticipants: 0,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.query).not.toHaveBeenCalled();
    await expect(
      service.create(user, {
        title: 'Cricket',
        description: 'x',
        categoryId: 'cricket',
        locationName: 'Park',
        locationDescription: 'Gate',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        maxParticipants: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates malformed title, date, category, capacity, and host ID input', async () => {
    const dto = plainToInstance(CreateActivityDto, {
      title: ' a ',
      description: 'x',
      categoryId: '',
      locationName: 'P',
      locationDescription: 'Gate',
      startsAt: 'not-a-date',
      maxParticipants: 101,
      hostUserId: 'forged-user',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const invalid = errors.map((error) => error.property);
    expect(invalid).toEqual(
      expect.arrayContaining([
        'title',
        'categoryId',
        'startsAt',
        'maxParticipants',
        'hostUserId',
      ]),
    );
  });

  it('rejects a category missing from the existing interest taxonomy', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.create(user, {
        title: 'Cricket',
        description: 'Friendly game',
        categoryId: 'unknown-category',
        locationName: 'Park',
        locationDescription: 'North gate',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        maxParticipants: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses deterministic listing order and parameterized filters/pagination', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })
      .mockResolvedValueOnce({ rows: [activityRow] });
    const result = await service.list(
      { categoryId: 'cricket', limit: 1, offset: 2 },
      user,
    );
    expect(result.pagination).toEqual({ limit: 1, offset: 2, total: 3 });
    expect(database.query.mock.calls[0][0]).toContain('a.category_id = $1');
    expect(database.query.mock.calls[1][0]).toContain(
      'ORDER BY a.starts_at ASC, a.activity_id ASC',
    );
    expect(database.query.mock.calls[1][1]).toEqual(['cricket', 1, 2]);
  });

  it('does not expose raw database error text to API callers', async () => {
    database.query.mockRejectedValueOnce(new Error('database password leaked'));
    await expect(
      service.list({ limit: 20, offset: 0 }, user),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('returns not found for absent details and forbids edits from another host', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getById('missing', user)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            host_user_id: 'other-profile',
            status: 'scheduled',
            starts_at: new Date(Date.now() + 86400000),
            ends_at: null,
            min_participants: 1,
            max_participants: 6,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ user_id: 'profile-1' }] });
    await expect(
      service.update(activityRow.activity_id, user, { title: 'New title' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires paired coordinates and valid end time', async () => {
    await expect(
      service.list({ latitude: 10, limit: 20, offset: 0 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(user, {
        title: 'Cricket',
        description: 'x',
        categoryId: 'cricket',
        locationName: 'Park',
        locationDescription: 'Gate',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        maxParticipants: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters activities with search and date aliases using safe parameterized queries', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [activityRow] });

    const result = await service.list(
      { search: 'cricket', dateFrom: '2026-10-15T00:00:00.000Z', limit: 10, offset: 0 },
      user,
    );

    expect(result.items).toHaveLength(1);
    const querySql = database.query.mock.calls[0][0];
    expect(querySql).toContain('a.starts_at >= $1::timestamptz');
    expect(querySql).toContain(
      '(a.title ILIKE $2 OR a.description ILIKE $3 OR a.location_name ILIKE $4)',
    );
    expect(database.query.mock.calls[0][1]).toEqual([
      '2026-10-15T00:00:00.000Z',
      '%cricket%',
      '%cricket%',
      '%cricket%',
    ]);
  });

  it('orders by newest first when sort=newest is requested', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [activityRow] });

    await service.list({ sort: 'newest', limit: 10, offset: 0 }, user);
    expect(database.query.mock.calls[1][0]).toContain(
      'ORDER BY a.created_at DESC, a.activity_id DESC',
    );
  });

  it('allows the host to cancel an activity and forbids non-hosts', async () => {
    // 1. Host can cancel
    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            host_user_id: 'profile-1',
            status: 'scheduled',
            starts_at: new Date(Date.now() + 86400000),
            ends_at: null,
            min_participants: 1,
            max_participants: 6,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ user_id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await service.cancel(activityRow.activity_id, user);
    expect(res).toEqual({ activityId: activityRow.activity_id, status: 'cancelled' });
    expect(database.query.mock.calls[2][0]).toContain("status = 'cancelled'");

    // 2. Non-host is forbidden from cancelling
    database.query
      .mockResolvedValueOnce({
        rows: [
          {
            host_user_id: 'different-profile',
            status: 'scheduled',
            starts_at: new Date(Date.now() + 86400000),
            ends_at: null,
            min_participants: 1,
            max_participants: 6,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ user_id: 'profile-1' }] });

    await expect(
      service.cancel(activityRow.activity_id, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
