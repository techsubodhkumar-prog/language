import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export interface SeedInterest {
  id: string;
  name: string;
  category: string;
}

export const INITIAL_INTERESTS: SeedInterest[] = [
  { id: 'cricket', name: 'Cricket', category: 'sports' },
  { id: 'football', name: 'Football', category: 'sports' },
  { id: 'badminton', name: 'Badminton', category: 'sports' },
  { id: 'gym_fitness', name: 'Gym & Fitness', category: 'sports' },
  { id: 'running', name: 'Running', category: 'sports' },
  { id: 'tea_coffee', name: 'Tea & Coffee Meetups', category: 'food' },
  { id: 'restaurants_food', name: 'Dining & Street Food', category: 'food' },
  { id: 'travel_trips', name: 'Weekend Trips & Trekking', category: 'travel' },
  { id: 'city_walks', name: 'City Walks & Sightseeing', category: 'travel' },
  { id: 'board_games', name: 'Board Games', category: 'games' },
  { id: 'video_games', name: 'Multiplayer Video Games', category: 'games' },
  { id: 'movies_cinema', name: 'Movies & Cinema', category: 'entertainment' },
];

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('placeholder')) {
    console.error('ERROR: DATABASE_URL is not configured with an active PostgreSQL instance.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log('Seeding initial curated interests...');
    await client.query('BEGIN');

    for (const interest of INITIAL_INTERESTS) {
      await client.query(
        `
        INSERT INTO interests (interest_id, name, category, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (interest_id)
        DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
      `,
        [interest.id, interest.name, interest.category],
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${INITIAL_INTERESTS.length} interests successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed interests:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
