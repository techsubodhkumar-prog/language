import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { INITIAL_INTERESTS } from '../../database/seed.js';

export interface InterestItem {
  interestId: string;
  name: string;
  category: string;
}

@Injectable()
export class InterestsService {
  private readonly logger = new Logger(InterestsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async listAvailableInterests(): Promise<InterestItem[]> {
    try {
      const result = await this.databaseService.query(
        `
        SELECT interest_id, name, category
        FROM interests
        WHERE is_active = TRUE
        ORDER BY category ASC, name ASC;
      `,
      );

      if (result.rows.length > 0) {
        return result.rows.map((row) => ({
          interestId: row.interest_id,
          name: row.name,
          category: row.category,
        }));
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.warn(`Could not query database interests: ${error.message}. Returning default list.`);
    }

    // Default fallback to ensure availability during bootstrapping
    return INITIAL_INTERESTS.map((i) => ({
      interestId: i.id,
      name: i.name,
      category: i.category,
    }));
  }

  async getUserInterests(supabaseUserId: string): Promise<InterestItem[]> {
    const result = await this.databaseService.query(
      `
      SELECT i.interest_id, i.name, i.category
      FROM user_interests ui
      JOIN profiles p ON p.user_id = ui.user_id
      JOIN interests i ON i.interest_id = ui.interest_id
      WHERE p.supabase_user_id = $1 AND i.is_active = TRUE
      ORDER BY i.category ASC, i.name ASC;
    `,
      [supabaseUserId],
    );

    return result.rows.map((row) => ({
      interestId: row.interest_id,
      name: row.name,
      category: row.category,
    }));
  }

  async replaceUserInterests(
    supabaseUserId: string,
    rawInterestIds: string[],
  ): Promise<InterestItem[]> {
    // 1. Deduplicate & sanitize IDs
    const uniqueIds = Array.from(
      new Set(
        rawInterestIds
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean),
      ),
    );

    // 2. Fetch the internal user_id from profiles
    const profileRes = await this.databaseService.query(
      'SELECT user_id FROM profiles WHERE supabase_user_id = $1',
      [supabaseUserId],
    );

    if (profileRes.rows.length === 0) {
      throw new NotFoundException(
        'User profile not found. Please complete profile creation before selecting interests.',
      );
    }

    const internalUserId = profileRes.rows[0].user_id;

    // 3. If interests are provided, validate that each one is active & valid
    if (uniqueIds.length > 0) {
      const validRes = await this.databaseService.query(
        'SELECT interest_id FROM interests WHERE interest_id = ANY($1) AND is_active = TRUE',
        [uniqueIds],
      );

      const validSet = new Set(validRes.rows.map((r) => r.interest_id));
      const invalidIds = uniqueIds.filter((id) => !validSet.has(id));

      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `Invalid or unavailable interest ID(s): ${invalidIds.join(', ')}`,
        );
      }
    }

    // 4. Perform atomic replacement in transaction
    await this.databaseService.withTransaction(async (client) => {
      // Clear existing selections
      await client.query('DELETE FROM user_interests WHERE user_id = $1', [
        internalUserId,
      ]);

      // Insert new selections
      for (const interestId of uniqueIds) {
        await client.query(
          'INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)',
          [internalUserId, interestId],
        );
      }
    });

    this.logger.log(
      `Replaced interests for user ${supabaseUserId}: ${uniqueIds.length} items`,
    );

    return this.getUserInterests(supabaseUserId);
  }
}
