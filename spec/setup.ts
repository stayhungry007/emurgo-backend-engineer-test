// spec/setup.ts
import { beforeAll, afterAll } from 'bun:test';
import { Database } from '../src/databases';

let testDb: Database;

export async function setupTestDatabase(): Promise<Database> {
  const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://postgres:rabbit@localhost:5432/emurgo_test';
  testDb = new Database(connectionString);
  await testDb.initialize();
  return testDb;
}

export async function cleanupTestDatabase(): Promise<void> {
  if (testDb) {
    // Clean up all tables
    await testDb['pool'].query('TRUNCATE blocks, transactions, outputs, balances CASCADE');
    await testDb.close();
  }
}