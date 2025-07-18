// spec/indexer-service.spec.ts

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from '../src/databases';
import { IndexerService } from '../src/services/indexer';
import { createGenesisBlock, createTestBlock, createTestTransaction, createTestOutput, createTestInput } from './helpers/test-helpers';

describe('IndexerService', () => {
  let db: Database;
  let indexerService: IndexerService;

  beforeEach(async () => {
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testDbUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set');
    }
    
    db = new Database(testDbUrl);
    await db.initialize();
    indexerService = new IndexerService(db);
    
    // Clean up any existing test data
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.close();
  });

  async function cleanupTestData() {
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

  describe('processBlock', () => {
    it('should process a valid genesis block', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      const result = await indexerService.processBlock(genesisBlock);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      const height = await indexerService.getCurrentHeight();
      expect(height).toBe(1);
      
      const balance = await indexerService.getBalance('addr1');
      expect(balance).toBe(100);
    });

    it('should reject invalid block data', async () => {
      const invalidBlock = {
        id: 'block1',
        height: 1,
        transactions: 'not_an_array'
      };
      
      const result = await indexerService.processBlock(invalidBlock);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('transactions must be an array');
    });

    it('should process a chain of blocks correctly', async () => {
      // Genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      let result = await indexerService.processBlock(genesisBlock);
      expect(result.success).toBe(true);
      
      // Second block
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 60),
          createTestOutput('addr3', 40)
        ]
      );
      const block2 = createTestBlock(2, [tx2]);
      result = await indexerService.processBlock(block2);
      expect(result.success).toBe(true);
      
      // Verify final state
      expect(await indexerService.getCurrentHeight()).toBe(2);
      expect(await indexerService.getBalance('addr1')).toBe(0);
      expect(await indexerService.getBalance('addr2')).toBe(60);
      expect(await indexerService.getBalance('addr3')).toBe(40);
    });

    it('should reject block with incorrect height sequence', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      // Skip height 2, try to add height 3
      const tx = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block = createTestBlock(3, [tx]); // Height 3 instead of 2
      
      const result = await indexerService.processBlock(block);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid height');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      const mockDb = {
        ...db,
        saveBlock: async () => {
          throw new Error('Database connection failed');
        }
      };
      
      const mockIndexerService = new IndexerService(mockDb as any);
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      const result = await mockIndexerService.processBlock(genesisBlock);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should reject block with null/undefined data', async () => {
      const result1 = await indexerService.processBlock(null);
      expect(result1.success).toBe(false);
      
      const result2 = await indexerService.processBlock(undefined);
      expect(result2.success).toBe(false);
    });

    it('should reject block with missing required fields', async () => {
      const invalidBlock = {
        id: 'block1',
        // missing height and transactions
      };
      
      const result = await indexerService.processBlock(invalidBlock);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle complex transaction chains', async () => {
      // Genesis block
      const genesisBlock = createGenesisBlock('addr1', 1000);
      await indexerService.processBlock(genesisBlock);
      
      // Multiple transactions in one block
      const tx1 = createTestTransaction(
        'tx1',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 300),
          createTestOutput('addr3', 700)
        ]
      );
      
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('tx1', 0)],
        [
          createTestOutput('addr4', 150),
          createTestOutput('addr5', 150)
        ]
      );
      
      const block2 = createTestBlock(2, [tx1, tx2]);
      const result = await indexerService.processBlock(block2);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getBalance('addr1')).toBe(0);
      expect(await indexerService.getBalance('addr2')).toBe(0); // spent in tx2
      expect(await indexerService.getBalance('addr3')).toBe(700);
      expect(await indexerService.getBalance('addr4')).toBe(150);
      expect(await indexerService.getBalance('addr5')).toBe(150);
    });
  });

  describe('getBalance', () => {
    it('should return correct balance for existing address', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      const balance = await indexerService.getBalance('addr1');
      expect(balance).toBe(100);
    });

    it('should return 0 for non-existent address', async () => {
      const balance = await indexerService.getBalance('nonexistent');
      expect(balance).toBe(0);
    });

    it('should throw error for invalid address', async () => {
      await expect(indexerService.getBalance('')).rejects.toThrow('Address must be a non-empty string');
    });

    it('should throw error for null/undefined address', async () => {
      await expect(indexerService.getBalance(null as any)).rejects.toThrow('Address must be a non-empty string');
      await expect(indexerService.getBalance(undefined as any)).rejects.toThrow('Address must be a non-empty string');
    });

    it('should throw error for non-string address', async () => {
      await expect(indexerService.getBalance(123 as any)).rejects.toThrow('Address must be a non-empty string');
      await expect(indexerService.getBalance({} as any)).rejects.toThrow('Address must be a non-empty string');
    });

    it('should update balance correctly after transactions', async () => {
      // Genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      // Transfer
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await indexerService.processBlock(block2);
      
      expect(await indexerService.getBalance('addr1')).toBe(0);
      expect(await indexerService.getBalance('addr2')).toBe(100);
    });

    it('should handle partial spends correctly', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      // Partial spend with change
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 30),
          createTestOutput('addr1', 70) // change back to original address
        ]
      );
      const block2 = createTestBlock(2, [tx2]);
      await indexerService.processBlock(block2);
      
      expect(await indexerService.getBalance('addr1')).toBe(70);
      expect(await indexerService.getBalance('addr2')).toBe(30);
    });
  });

  describe('rollbackToHeight', () => {
    beforeEach(async () => {
      // Set up a chain of blocks
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await indexerService.processBlock(block2);
      
      const tx3 = createTestTransaction(
        'tx3',
        [createTestInput('tx2', 0)],
        [createTestOutput('addr3', 100)]
      );
      const block3 = createTestBlock(3, [tx3]);
      await indexerService.processBlock(block3);
    });

    it('should rollback to specified height successfully', async () => {
      const result = await indexerService.rollbackToHeight(2);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      // Verify rollback
      expect(await indexerService.getCurrentHeight()).toBe(2);
      expect(await indexerService.getBalance('addr2')).toBe(100);
      expect(await indexerService.getBalance('addr3')).toBe(0);
    });

    it('should reject rollback with invalid height', async () => {
      const result = await indexerService.rollbackToHeight(-1);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Height must be a non-negative number');
    });

    it('should reject rollback to future height', async () => {
      const result = await indexerService.rollbackToHeight(10);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback to height 10, current height is 3');
    });

    it('should reject rollback beyond 2000 blocks', async () => {
      // Mock current height to be much higher
      const mockDb = {
        ...db,
        getCurrentHeight: async () => 3000
      };
      
      const mockIndexerService = new IndexerService(mockDb as any);
      const result = await mockIndexerService.rollbackToHeight(500);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback more than 2000 blocks');
    });

    it('should handle rollback to genesis block', async () => {
      const result = await indexerService.rollbackToHeight(1);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getCurrentHeight()).toBe(1);
      expect(await indexerService.getBalance('addr1')).toBe(100);
      expect(await indexerService.getBalance('addr2')).toBe(0);
      expect(await indexerService.getBalance('addr3')).toBe(0);
    });

    it('should handle rollback to height 0', async () => {
      const result = await indexerService.rollbackToHeight(0);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getCurrentHeight()).toBe(0);
      expect(await indexerService.getBalance('addr1')).toBe(0);
      expect(await indexerService.getBalance('addr2')).toBe(0);
      expect(await indexerService.getBalance('addr3')).toBe(0);
    });

    it('should reject non-numeric height', async () => {
      const result = await indexerService.rollbackToHeight('invalid' as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Height must be a non-negative number');
    });

    it('should reject null/undefined height', async () => {
      const result1 = await indexerService.rollbackToHeight(null as any);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('Height must be a non-negative number');
      
      const result2 = await indexerService.rollbackToHeight(undefined as any);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Height must be a non-negative number');
    });

    it('should handle database errors during rollback', async () => {
      const mockDb = {
        ...db,
        getCurrentHeight: async () => 3,
        rollbackToHeight: async () => {
          throw new Error('Database rollback failed');
        }
      };
      
      const mockIndexerService = new IndexerService(mockDb as any);
      const result = await mockIndexerService.rollbackToHeight(2);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database rollback failed');
    });

    it('should rollback multiple blocks correctly', async () => {
      // Add more blocks to the chain
      for (let i = 4; i <= 10; i++) {
        const tx = createTestTransaction(
          `tx${i}`,
          [createTestInput(`tx${i-1}`, 0)],
          [createTestOutput(`addr${i}`, 100)]
        );
        const block = createTestBlock(i, [tx]);
        await indexerService.processBlock(block);
      }
      
      expect(await indexerService.getCurrentHeight()).toBe(10);
      
      // Rollback to height 5
      const result = await indexerService.rollbackToHeight(5);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getCurrentHeight()).toBe(5);
      expect(await indexerService.getBalance('addr5')).toBe(100);
      expect(await indexerService.getBalance('addr6')).toBe(0);
      expect(await indexerService.getBalance('addr10')).toBe(0);
    });
  });

  describe('getCurrentHeight', () => {
    it('should return 0 for empty blockchain', async () => {
      const height = await indexerService.getCurrentHeight();
      expect(height).toBe(0);
    });

    it('should return correct height after processing blocks', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      expect(await indexerService.getCurrentHeight()).toBe(1);
      
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await indexerService.processBlock(block2);
      
      expect(await indexerService.getCurrentHeight()).toBe(2);
    });

    it('should return correct height after rollback', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await indexerService.processBlock(block2);
      
      expect(await indexerService.getCurrentHeight()).toBe(2);
      
      await indexerService.rollbackToHeight(1);
      expect(await indexerService.getCurrentHeight()).toBe(1);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle concurrent block processing', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      // Process the same block concurrently
      const promises = [
        indexerService.processBlock(genesisBlock),
        indexerService.processBlock(genesisBlock)
      ];
      
      const results = await Promise.all(promises);
      
      // One should succeed, one should fail (duplicate block)
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    it('should handle very large amounts', async () => {
      const largeAmount = Number.MAX_SAFE_INTEGER;
      const genesisBlock = createGenesisBlock('addr1', largeAmount);
      
      const result = await indexerService.processBlock(genesisBlock);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getBalance('addr1')).toBe(largeAmount);
    });

    it('should handle zero amount transactions', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      await indexerService.processBlock(genesisBlock);
      
      const tx = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 0),
          createTestOutput('addr3', 100)
        ]
      );
      const block = createTestBlock(2, [tx]);
      const result = await indexerService.processBlock(block);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getBalance('addr2')).toBe(0);
      expect(await indexerService.getBalance('addr3')).toBe(100);
    });

    it('should handle addresses with special characters', async () => {
      const specialAddr = 'addr_with-special.chars@domain.com';
      const genesisBlock = createGenesisBlock(specialAddr, 100);
      
      const result = await indexerService.processBlock(genesisBlock);
      
      expect(result.success).toBe(true);
      expect(await indexerService.getBalance(specialAddr)).toBe(100);
    });
  });
});