import { Pool } from 'pg';
import { randomUUID } from 'crypto';

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
  `);
}


export async function testPostgres() {
  const id = randomUUID();
  const name = 'Satoshi';
  const email = 'Nakamoto';

  await pool.query(`DELETE FROM users;`);

  await pool.query(`
    INSERT INTO users (id, name, email)
    VALUES ($1, $2, $3);
  `, [id, name, email]);

  const { rows } = await pool.query(`
    SELECT * FROM users;
  `);

  console.log('USERS', rows);
}

export async function getCurrentHeight() {
  const res = await pool.query('SELECT height FROM blocks ORDER BY height DESC LIMIT 1');
  return res.rows.length > 0 ? res.rows[0].height : 0;
}
