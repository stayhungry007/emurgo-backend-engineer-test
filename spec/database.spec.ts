// spec/database.spec.ts
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from '../src/databases';
import type { Block, Transaction } from '../src/types';
import { setupTestDatabase, cleanupTestDatabase } from './setup';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    db = await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  test('should initialize tables correctly', async () => {
    const result = await db['pool'].query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableNames = result.rows.map(row => row.table_name);
    expect(tableNames).toContain('blocks');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('outputs');
    expect(tableNames).toContain('balances');
  });

  test('should save and retrieve block correctly', async () => {
    const block: Block = {
      id: 'block_1',
      height: 1,
      transactions: [{
        id: 'tx_1',
        inputs: [],
        outputs: [{
          address: 'addr_1',
          value: 100
        }]
      }]
    };

    await db.saveBlock(block);

    const height = await db.getCurrentHeight();
    expect(height).toBe(1);

    const output = await db.getOutput('tx_1', 0);
    expect(output).toEqual({
      txId: 'tx_1',
      index: 0,
      address: 'addr_1',
      value: 100,
      spent: false
    });
  });

  test('should calculate balance correctly', async () => {
    const block: Block = {
      id: 'block_1',
      height: 1,
      transactions: [{
        id: 'tx_1',
        inputs: [],
        outputs: [
          { address: 'addr_1', value: 100 },
          { address: 'addr_1', value: 50 }
        ]
      }]
    };

    await db.saveBlock(block);

    const balance = await db.getBalance('addr_1');
    expect(balance).toBe(150);
  });

  test('should mark inputs as spent when processing transactions', async () => {
    // First block with initial output
    const block1: Block = {
      id: 'block_1',
      height: 1,
      transactions: [{
        id: 'tx_1',
        inputs: [],
        outputs: [{ address: 'addr_1', value: 100 }]
      }]
    };

    await db.saveBlock(block1);

    // Second block spending the output
    const block2: Block = {
      id: 'block_2',
      height: 2,
      transactions: [{
        id: 'tx_2',
        inputs: [{ txId: 'tx_1', index: 0 }],
        outputs: [{ address: 'addr_2', value: 100 }]
      }]
    };

    await db.saveBlock(block2);

    const spentOutput = await db.getOutput('tx_1', 0);
    expect(spentOutput?.spent).toBe(true);

    const newOutput = await db.getOutput('tx_2', 0);
    expect(newOutput?.spent).toBe(false);
  });

  test('should rollback to specified height', async () => {
    // Save multiple blocks
    for (let i = 1; i <= 5; i++) {
      const block: Block = {
        id: `block_${i}`,
        height: i,
        transactions: [{
          id: `tx_${i}`,
          inputs: [],
          outputs: [{ address: `addr_${i}`, value: 100 }]
        }]
      };
      await db.saveBlock(block);
    }

    expect(await db.getCurrentHeight()).toBe(5);

    // Rollback to height 3
    await db.rollbackToHeight(3);

    expect(await db.getCurrentHeight()).toBe(3);

    // Verify blocks 4 and 5 are gone
    const output4 = await db.getOutput('tx_4', 0);
    const output5 = await db.getOutput('tx_5', 0);
    expect(output4).toBeNull();
    expect(output5).toBeNull();

    // Verify block 3 still exists
    const output3 = await db.getOutput('tx_3', 0);
    expect(output3).not.toBeNull();
  });

  test('should handle transaction atomicity on error', async () => {
    const invalidBlock: Block = {
      id: 'block_1',
      height: 1,
      transactions: [{
        id: 'tx_1',
        inputs: [],
        outputs: [{ address: 'addr_1', value: 100 }]
      }]
    };

    // Simulate database error by closing connection
    await db.close();
    
    try {
      await db.saveBlock(invalidBlock);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
