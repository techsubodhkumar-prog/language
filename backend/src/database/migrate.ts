import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('placeholder')) {
    console.error('ERROR: DATABASE_URL is not configured with an active PostgreSQL instance.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log('Checking database migration status...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(__dirname, '../../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
      .sort();

    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map((r: { version: string }) => r.version));

    let appliedCount = 0;
    for (const file of files) {
      if (!appliedVersions.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Applied migration: ${file} successfully.`);
          appliedCount++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`FAILED migration: ${file}`, err);
          throw err;
        }
      } else {
        console.log(`Skipping already applied migration: ${file}`);
      }
    }

    console.log(`Migrations complete. ${appliedCount} new migrations applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
