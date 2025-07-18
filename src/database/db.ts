import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      block_height INT NOT NULL,
      inputs JSONB,
      outputs JSONB
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS balances (
      address TEXT PRIMARY KEY,
      balance INT NOT NULL
    );
  `);
}

export async function getCurrentHeight() {
  const res = await pool.query('SELECT height FROM blocks ORDER BY height DESC LIMIT 1');
  return res.rows.length > 0 ? res.rows[0].height : 0;
}
