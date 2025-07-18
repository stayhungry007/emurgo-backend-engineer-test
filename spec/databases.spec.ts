// spec/database.spec.ts

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from '../src/databases';
import { createGenesisBlock, createTestBlock, createTestTransaction, createTestOutput, createTestInput } from './helpers/test-helpers';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    // Use a test database URL - in a real scenario, you'd use a separate test database
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testDbUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set');
    }
    
    db = new Database(testDbUrl);
    await db.initialize();
    
    // Clean up any existing test data
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.close();
  });

  async function cleanupTestData() {
    // Clean up test data in reverse order due to foreign key constraints
    const client = await (db as any).pool.connect();
    try {
      await client.query('DELETE FROM outputs');
      await client.query('DELETE FROM transactions');
      await client.query('DELETE FROM blocks');
      await client.query('DELETE FROM balances');
    } finally {
      client.release();
    }
  }

  describe('saveBlock', () => {
    it('should save a genesis block successfully', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      await db.saveBlock(genesisBlock);
      
      const height = await db.getCurrentHeight();
      expect(height).toBe(1);
      
      const balance = await db.getBalance('addr1');
      expect(balance).toBe(100);
    });

    it('should save multiple blocks and maintain correct balances', async () => {
      // Genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      // Second block - transfer from addr1 to addr2 and addr3
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 60),
          createTestOutput('addr3', 40)
        ]
      );
      const block2 = createTestBlock(2, [tx2]);
      await db.saveBlock(block2);
      
      // Check balances
      expect(await db.getBalance('addr1')).toBe(0);
      expect(await db.getBalance('addr2')).toBe(60);
      expect(await db.getBalance('addr3')).toBe(40);
    });
  });

  describe('getOutput', () => {
    it('should retrieve an output correctly', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      const output = await db.getOutput('genesis_tx', 0);
      expect(output).toBeTruthy();
      expect(output!.address).toBe('addr1');
      expect(output!.value).toBe(100);
      expect(output!.spent).toBe(false);
    });

    it('should return null for non-existent output', async () => {
      const output = await db.getOutput('nonexistent', 0);
      expect(output).toBeNull();
    });
  });

  describe('rollbackToHeight', () => {
    it('should rollback to a previous height correctly', async () => {
      // Create a chain of 3 blocks
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await db.saveBlock(block2);
      
      const tx3 = createTestTransaction(
        'tx3',
        [createTestInput('tx2', 0)],
        [createTestOutput('addr3', 100)]
      );
      const block3 = createTestBlock(3, [tx3]);
      await db.saveBlock(block3);
      
      // Verify initial state
      expect(await db.getCurrentHeight()).toBe(3);
      expect(await db.getBalance('addr1')).toBe(0);
      expect(await db.getBalance('addr2')).toBe(0);
      expect(await db.getBalance('addr3')).toBe(100);
      
      // Rollback to height 2
      await db.rollbackToHeight(2);
      
      // Verify rollback
      expect(await db.getCurrentHeight()).toBe(2);
      expect(await db.getBalance('addr1')).toBe(0);
      expect(await db.getBalance('addr2')).toBe(100);
      expect(await db.getBalance('addr3')).toBe(0);
      
      // Verify the output from tx2 is now unspent
      const output = await db.getOutput('tx2', 0);
      expect(output!.spent).toBe(false);
    });

    it('should handle rollback to height 0', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      await db.rollbackToHeight(0);
      
      expect(await db.getCurrentHeight()).toBe(0);
      expect(await db.getBalance('addr1')).toBe(0);
    });
  });

  describe('getBalance', () => {
    it('should return 0 for non-existent address', async () => {
      const balance = await db.getBalance('nonexistent');
      expect(balance).toBe(0);
    });

    it('should calculate balance correctly with multiple transactions', async () => {
      // Genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      // Transfer to addr2
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await db.saveBlock(block2);
      
      // Transfer from addr2 to addr1 (partial) and addr3
      const tx3 = createTestTransaction(
        'tx3',
        [createTestInput('tx2', 0)],
        [
          createTestOutput('addr1', 30),
          createTestOutput('addr3', 70)
        ]
      );
      const block3 = createTestBlock(3, [tx3]);
      await db.saveBlock(block3);
      
      expect(await db.getBalance('addr1')).toBe(30);
      expect(await db.getBalance('addr2')).toBe(0);
      expect(await db.getBalance('addr3')).toBe(70);
    });
  });
});