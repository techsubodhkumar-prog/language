import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserProfileResponse {
  userId: string;
  supabaseUserId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async getProfile(supabaseUserId: string): Promise<UserProfileResponse> {
    const result = await this.databaseService.query(
      `
      SELECT user_id, supabase_user_id, display_name, bio, avatar_url, created_at, updated_at
      FROM profiles
      WHERE supabase_user_id = $1
    `,
      [supabaseUserId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('User profile not found. Please complete profile onboarding.');
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      supabaseUserId: row.supabase_user_id,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsertProfile(
    supabaseUserId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    if (dto.displayName === undefined) {
      const existing = await this.getProfile(supabaseUserId);
      const updated = await this.databaseService.query(
        `UPDATE profiles SET bio = COALESCE($2, bio), avatar_url = COALESCE($3, avatar_url), updated_at = NOW()
         WHERE supabase_user_id = $1
         RETURNING user_id, supabase_user_id, display_name, bio, avatar_url, created_at, updated_at`,
        [supabaseUserId, dto.bio ?? null, dto.avatarUrl ?? null],
      );
      const row = updated.rows[0];
      if (!row) return existing;
      return { userId: row.user_id, supabaseUserId: row.supabase_user_id, displayName: row.display_name,
        bio: row.bio, avatarUrl: row.avatar_url, createdAt: row.created_at, updatedAt: row.updated_at };
    }
    const result = await this.databaseService.query(
      `
      INSERT INTO profiles (supabase_user_id, display_name, bio, avatar_url, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (supabase_user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = COALESCE(EXCLUDED.bio, profiles.bio),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = NOW()
      RETURNING user_id, supabase_user_id, display_name, bio, avatar_url, created_at, updated_at;
    `,
      [supabaseUserId, dto.displayName, dto.bio ?? null, dto.avatarUrl ?? null],
    );

    const row = result.rows[0];
    this.logger.log(`Profile updated/created for Supabase user: ${supabaseUserId}`);
    return {
      userId: row.user_id,
      supabaseUserId: row.supabase_user_id,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
