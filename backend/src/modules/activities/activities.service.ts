import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { CreateActivityDto } from './dto/create-activity.dto.js';
import type { ListActivitiesDto } from './dto/list-activities.dto.js';
import type { UpdateActivityDto } from './dto/update-activity.dto.js';

interface ActivityRow {
  activity_id: string;
  host_user_id: string;
  host_supabase_user_id: string;
  host_name: string;
  title: string;
  description: string;
  category_id: string;
  category_name: string;
  location_name: string;
  location_description: string;
  starts_at: Date | string;
  ends_at: Date | string | null;
  min_participants: number;
  max_participants: number;
  participant_count: number;
  estimated_cost: string | number | null;
  visibility: string;
  join_policy: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const SELECT_ACTIVITY = `
  SELECT a.activity_id, a.host_user_id, p.supabase_user_id AS host_supabase_user_id, p.display_name AS host_name,
         a.title, a.description, a.category_id, i.name AS category_name,
         a.location_name, a.location_description, a.starts_at, a.ends_at,
         a.min_participants, a.max_participants, a.estimated_cost,
         1 + (SELECT COUNT(*) FROM activity_memberships m
              WHERE m.activity_id = a.activity_id AND m.status = 'approved') AS participant_count,
         a.visibility, a.join_policy, a.status, a.created_at, a.updated_at
  FROM activities a
  JOIN profiles p ON p.user_id = a.host_user_id
  JOIN interests i ON i.interest_id = a.category_id`;

function asIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function mapActivity(row: ActivityRow, isHost = false) {
  return {
    activityId: row.activity_id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    category: row.category_name,
    locationName: row.location_name,
    locationDescription: row.location_description,
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    participantCount: Number(row.participant_count ?? 1),
    remainingPlaces: Math.max(
      0,
      row.max_participants - Number(row.participant_count ?? 1),
    ),
    estimatedCost:
      row.estimated_cost === null ? null : Number(row.estimated_cost),
    visibility: row.visibility,
    joinPolicy: row.join_policy,
    status: row.status,
    hostName: row.host_name,
    isHost,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly database: DatabaseService) {}

  private async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ) {
    try {
      return await this.database.query<T>(text, params);
    } catch (error) {
      this.rethrowDatabaseConstraint(error);
    }
  }

  private async getProfileId(supabaseUserId: string): Promise<string> {
    const result = await this.query<{ user_id: string }>(
      'SELECT user_id FROM profiles WHERE supabase_user_id = $1',
      [supabaseUserId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException(
        'User profile not found. Please complete profile onboarding.',
      );
    }
    return result.rows[0].user_id;
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const result = await this.query<{ interest_id: string }>(
      'SELECT interest_id FROM interests WHERE interest_id = $1 AND is_active = TRUE',
      [categoryId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('The selected category is unavailable.');
    }
  }

  private validateDates(
    startsAt: string | Date,
    endsAt?: string | Date | null,
  ) {
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Activity start time must be in the future.',
      );
    }
    if (end && (!Number.isFinite(end.getTime()) || end <= start)) {
      throw new BadRequestException(
        'Activity end time must be after the start time.',
      );
    }
  }

  private validateCoordinates(dto: { latitude?: number; longitude?: number }) {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException(
        'Provide both latitude and longitude, or neither.',
      );
    }
  }

  async create(user: AuthenticatedUser, dto: CreateActivityDto) {
    this.validateDates(dto.startsAt, dto.endsAt);
    this.validateCoordinates(dto);
    const min = dto.minParticipants ?? 1;
    if (min > dto.maxParticipants) {
      throw new BadRequestException(
        'Minimum participants cannot exceed total capacity.',
      );
    }
    const hostId = await this.getProfileId(user.userId);
    await this.assertActiveCategory(dto.categoryId);
    try {
      const result = await this.query<ActivityRow>(
        `INSERT INTO activities
          (host_user_id, title, description, category_id, location_name, location_description,
           location_point, starts_at, ends_at, min_participants, max_participants,
           estimated_cost, visibility, join_policy)
         VALUES ($1,$2,$3,$4,$5,$6,
           CASE WHEN $7::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($7::double precision,$8::double precision),4326)::geography END,
           $9,$10,$11,$12,$13,$14,$15)
         RETURNING activity_id`,
        [
          hostId,
          dto.title,
          dto.description,
          dto.categoryId,
          dto.locationName,
          dto.locationDescription,
          dto.longitude ?? null,
          dto.latitude ?? null,
          dto.startsAt,
          dto.endsAt ?? null,
          min,
          dto.maxParticipants,
          dto.estimatedCost ?? null,
          dto.visibility ?? 'public',
          dto.joinPolicy ?? 'approval',
        ],
      );
      return this.getById(result.rows[0].activity_id, user);
    } catch (error) {
      this.rethrowDatabaseConstraint(error);
    }
  }

  async list(query: ListActivitiesDto, user: AuthenticatedUser) {
    const { latitude, longitude, radiusKm, from, to } = query;
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException(
        'Provide both latitude and longitude for location filtering.',
      );
    }
    if (
      radiusKm !== undefined &&
      (latitude === undefined || longitude === undefined)
    ) {
      throw new BadRequestException(
        'Location and radius must be supplied together.',
      );
    }
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'The from date must be before the to date.',
      );
    }
    const filters = [
      "a.status = 'scheduled'",
      "a.visibility = 'public'",
      'a.starts_at >= NOW()',
    ];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      filters.push(sql.replace('?', `$${params.length}`));
    };
    if (query.categoryId) add('a.category_id = ?', query.categoryId);
    if (from) add('a.starts_at >= ?::timestamptz', from);
    if (to) add('a.starts_at <= ?::timestamptz', to);
    if (query.location?.trim())
      add('a.location_name ILIKE ?', `%${query.location.trim()}%`);
    if (
      latitude !== undefined &&
      longitude !== undefined &&
      radiusKm !== undefined
    ) {
      params.push(longitude, latitude, radiusKm * 1000);
      filters.push(`a.location_point IS NOT NULL AND ST_DWithin(a.location_point,
        ST_SetSRID(ST_MakePoint($${params.length - 2},$${params.length - 1}),4326)::geography,
        $${params.length}::double precision)`);
    }
    const where = filters.join(' AND ');
    const count = await this.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM activities a WHERE ${where}`,
      params,
    );
    const listParams = [...params, query.limit, query.offset];
    const result = await this.query<ActivityRow>(
      `${SELECT_ACTIVITY} WHERE ${where}
       ORDER BY a.starts_at ASC, a.activity_id ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );
    return {
      items: result.rows.map((row) =>
        mapActivity(row, row.host_supabase_user_id === user.userId),
      ),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(count.rows[0]?.total ?? 0),
      },
    };
  }

  async getById(id: string, user: AuthenticatedUser) {
    const result = await this.query<ActivityRow>(
      `${SELECT_ACTIVITY} WHERE a.activity_id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Activity not found.');
    const isHost = row.host_supabase_user_id === user.userId;
    if (row.visibility === 'invite_only' && !isHost) {
      throw new NotFoundException('Activity not found.');
    }
    return mapActivity(row, isHost);
  }

  async update(id: string, user: AuthenticatedUser, dto: UpdateActivityDto) {
    const current = await this.getRaw(id);
    const hostId = await this.getProfileId(user.userId);
    if (current.host_user_id !== hostId)
      throw new ForbiddenException(
        'Only the activity host can make this change.',
      );
    if (current.status !== 'scheduled')
      throw new ConflictException('Cancelled activities cannot be edited.');
    if (dto.categoryId !== undefined) {
      await this.assertActiveCategory(dto.categoryId);
    }
    const startsAt = dto.startsAt ?? current.starts_at;
    const endsAt = dto.endsAt === undefined ? current.ends_at : dto.endsAt;
    this.validateDates(startsAt, endsAt);
    this.validateCoordinates(dto);
    const min = dto.minParticipants ?? current.min_participants;
    const max = dto.maxParticipants ?? current.max_participants;
    if (min > max)
      throw new BadRequestException(
        'Minimum participants cannot exceed total capacity.',
      );

    const fields: Array<[keyof UpdateActivityDto, string]> = [
      ['title', 'title'],
      ['description', 'description'],
      ['categoryId', 'category_id'],
      ['locationName', 'location_name'],
      ['locationDescription', 'location_description'],
      ['startsAt', 'starts_at'],
      ['endsAt', 'ends_at'],
      ['minParticipants', 'min_participants'],
      ['maxParticipants', 'max_participants'],
      ['estimatedCost', 'estimated_cost'],
      ['visibility', 'visibility'],
      ['joinPolicy', 'join_policy'],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of fields) {
      const value = dto[key];
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException(
          'Provide both latitude and longitude, or neither.',
        );
      }
      params.push(dto.longitude, dto.latitude);
      sets.push(
        `location_point = ST_SetSRID(ST_MakePoint($${params.length - 1},$${params.length}),4326)::geography`,
      );
    }
    if (sets.length === 0)
      throw new BadRequestException('Provide at least one field to update.');
    params.push(id);
    try {
      await this.database.withTransaction(async (client) => {
        const locked = await client.query<{
          host_user_id: string;
          status: string;
        }>(
          'SELECT host_user_id, status FROM activities WHERE activity_id = $1 FOR UPDATE',
          [id],
        );
        if (!locked.rows[0]) throw new NotFoundException('Activity not found.');
        if (locked.rows[0].host_user_id !== hostId)
          throw new ForbiddenException(
            'Only the activity host can make this change.',
          );
        if (locked.rows[0].status !== 'scheduled')
          throw new ConflictException('Cancelled activities cannot be edited.');
        const approved = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM activity_memberships WHERE activity_id = $1 AND status = 'approved'",
          [id],
        );
        const confirmedTotal = 1 + Number(approved.rows[0]?.count ?? 0);
        if (max < confirmedTotal)
          throw new ConflictException(
            'Maximum capacity cannot be lower than the current participant count.',
          );
        await client.query(
          `UPDATE activities SET ${sets.join(', ')}, updated_at = NOW()
           WHERE activity_id = $${params.length}`,
          params,
        );
      });
    } catch (error) {
      this.rethrowDatabaseConstraint(error);
    }
    return this.getById(id, user);
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const current = await this.getRaw(id);
    const hostId = await this.getProfileId(user.userId);
    if (current.host_user_id !== hostId)
      throw new ForbiddenException('Only the activity host can cancel it.');
    await this.query(
      "UPDATE activities SET status = 'cancelled', updated_at = NOW() WHERE activity_id = $1 AND status = 'scheduled'",
      [id],
    );
    return { activityId: id, status: 'cancelled' };
  }

  private async getRaw(id: string) {
    const result = await this.query<{
      host_user_id: string;
      status: string;
      starts_at: Date;
      ends_at: Date | null;
      min_participants: number;
      max_participants: number;
    }>(
      'SELECT host_user_id, status, starts_at, ends_at, min_participants, max_participants FROM activities WHERE activity_id = $1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Activity not found.');
    return result.rows[0];
  }

  private rethrowDatabaseConstraint(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: string }).code;
    if (code === '23503')
      throw new BadRequestException('The selected category is unavailable.');
    if (code === '23514' || code === '22P02')
      throw new BadRequestException(
        'Activity data violates a required constraint.',
      );
    throw new InternalServerErrorException(
      'Unable to complete the activity request.',
    );
  }
}
