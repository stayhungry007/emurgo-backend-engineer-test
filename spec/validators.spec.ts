// spec/validators.spec.ts

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from '../src/databases';
import { BlockValidator, validateBlockSchema } from '../src/validators';
import { createGenesisBlock, createTestBlock, createTestTransaction, createTestOutput, createTestInput } from './helpers/test-helpers';

describe('BlockValidator', () => {
  let db: Database;
  let validator: BlockValidator;

  beforeEach(async () => {
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testDbUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set');
    }
    
    db = new Database(testDbUrl);
    await db.initialize();
    validator = new BlockValidator(db);
    
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

  describe('validateBlock', () => {
    it('should validate a correct genesis block', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      const result = await validator.validateBlock(genesisBlock);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject block with incorrect height', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      genesisBlock.height = 2; // Should be 1 for first block
      
      const result = await validator.validateBlock(genesisBlock);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid height');
    });

    it('should reject block with incorrect ID', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      genesisBlock.id = 'incorrect_id';
      
      const result = await validator.validateBlock(genesisBlock);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid block ID');
    });

    it('should reject block with unbalanced transaction', async () => {
      // Create genesis block first
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      // Create block with unbalanced transaction
      const tx = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)], // Input: 100
        [createTestOutput('addr2', 50)] // Output: 50 (unbalanced)
      );
      const block = createTestBlock(2, [tx]);
      
      const result = await validator.validateBlock(block);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not equal output sum');
    });

    it('should reject block referencing non-existent output', async () => {
      const tx = createTestTransaction(
        'tx1',
        [createTestInput('nonexistent_tx', 0)],
        [createTestOutput('addr1', 100)]
      );
      const block = createTestBlock(1, [tx]);
      
      const result = await validator.validateBlock(block);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Referenced output not found');
    });

    it('should reject block trying to spend already spent output', async () => {
      // Create genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      await db.saveBlock(genesisBlock);
      
      // Create block that spends the genesis output
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await db.saveBlock(block2);
      
      // Try to spend the same output again
      const tx3 = createTestTransaction(
        'tx3',
        [createTestInput('genesis_tx', 0)], // Already spent
        [createTestOutput('addr3', 100)]
      );
      const block3 = createTestBlock(3, [tx3]);
      
      const result = await validator.validateBlock(block3);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Output already spent');
    });

    it('should reject transaction with negative output value', async () => {
      const tx = createTestTransaction(
        'tx1',
        [],
        [createTestOutput('addr1', -50)]
      );
      const block = createTestBlock(1, [tx]);
      
      const result = await validator.validateBlock(block);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Negative output value not allowed');
    });
  });
});

describe('validateBlockSchema', () => {
  it('should validate correct block schema', () => {
    const block = createGenesisBlock('addr1', 100);
    
    const result = validateBlockSchema(block);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject null or undefined block', () => {
    expect(validateBlockSchema(null).isValid).toBe(false);
    expect(validateBlockSchema(undefined).isValid).toBe(false);
  });

  it('should reject block without required fields', () => {
    const invalidBlock = {
      height: 1,
      transactions: []
      // Missing id
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Block ID');
  });

  it('should reject block with invalid height', () => {
    const invalidBlock = {
      id: 'block1',
      height: 0, // Invalid height
      transactions: []
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('height must be a positive number');
  });

  it('should reject block with invalid transactions array', () => {
    const invalidBlock = {
      id: 'block1',
      height: 1,
      transactions: 'not_an_array'
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('transactions must be an array');
  });

  it('should reject block with invalid transaction structure', () => {
    const invalidBlock = {
      id: 'block1',
      height: 1,
      transactions: [{
        // Missing id
        inputs: [],
        outputs: []
      }]
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Transaction ID');
  });

  it('should reject transaction with invalid input structure', () => {
    const invalidBlock = {
      id: 'block1',
      height: 1,
      transactions: [{
        id: 'tx1',
        inputs: [{
          txId: 'tx0',
          index: 'not_a_number'
        }],
        outputs: []
      }]
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('index must be a non-negative number');
  });

  it('should reject transaction with invalid output structure', () => {
    const invalidBlock = {
      id: 'block1',
      height: 1,
      transactions: [{
        id: 'tx1',
        inputs: [],
        outputs: [{
          address: 'addr1',
          value: 'not_a_number'
        }]
      }]
    };
    
    const result = validateBlockSchema(invalidBlock);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('value must be a non-negative number');
  });
});