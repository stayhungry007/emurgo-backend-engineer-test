// spec/simplified.spec.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Pool } from 'pg';
import { 
  BlockBuilder, 
  TransactionBuilder, 
  postBlock, 
  getBalance, 
  rollback, 
  expectBalance,
  createGenesisBlock,
  createTransferBlock
} from './test-helpers';

// Test database connection
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://myuser:mypassword@localhost:5432/mydatabase'
});

describe('Blockchain Indexer API Tests (Simplified)', () => {
  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  beforeEach(async () => {
    // Clean up database before each test
    await testPool.query('DELETE FROM transactions');
    await testPool.query('DELETE FROM balances');
    await testPool.query('DELETE FROM blocks');
  });

  afterAll(async () => {
    await testPool.end();
  });

  describe('Block Validation', () => {
    test('should accept valid genesis block', async () => {
      const block = createGenesisBlock('addr1', 100);
      const response = await postBlock(block);
      
      expect(response.status).toBe(200);
      await expectBalance('addr1', 100);
    });

    test('should reject invalid height', async () => {
      const block = new BlockBuilder(5) // Wrong height
        .addTransaction(
          new TransactionBuilder('tx1')
            .addOutput('addr1', 100)
            .build()
        )
        .build();

      const response = await postBlock(block);
      expect(response.status).toBe(400);
    });

    test('should reject invalid block ID', async () => {
      const block = {
        id: 'invalid-hash',
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{ address: 'addr1', value: 100 }]
        }]
      };

      const response = await postBlock(block);
      expect(response.status).toBe(400);
    });
  });

  describe('Transaction Processing', () => {
    test('should process simple transfer correctly', async () => {
      // Genesis block
      const genesis = createGenesisBlock('addr1', 100);
      let response = await postBlock(genesis);
      expect(response.status).toBe(200);

      // Transfer block
      const transfer = createTransferBlock(2, 'tx2', 'tx1', 0, [
        { address: 'addr2', value: 60 },
        { address: 'addr3', value: 40 }
      ]);
      
      response = await postBlock(transfer);
      expect(response.status).toBe(200);

      // Check balances
      await expectBalance('addr1', 0);
      await expectBalance('addr2', 60);
      await expectBalance('addr3', 40);
    });

    test('should reject input/output sum mismatch', async () => {
      // Genesis block
      const genesis = createGenesisBlock('addr1', 100);
      await postBlock(genesis);

      // Invalid transfer (outputs sum to more than inputs)
      const invalidTransfer = createTransferBlock(2, 'tx2', 'tx1', 0, [
        { address: 'addr2', value: 60 },
        { address: 'addr3', value: 50 } // Total: 110 > 100
      ]);
      
      const response = await postBlock(invalidTransfer);
      expect(response.status).toBe(400);
    });
  });

  describe('Balance Queries', () => {
    test('should return correct balance for existing address', async () => {
      const genesis = createGenesisBlock('addr1', 100);
      await postBlock(genesis);

      const response = await getBalance('addr1');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance).toBe(100);
    });

    test('should return 404 for non-existent address', async () => {
      const response = await getBalance('nonexistent');
      expect(response.status).toBe(404);
    });
  });

  describe('Rollback Functionality', () => {
    test('should rollback successfully', async () => {
      // Create a chain of 3 blocks
      const genesis = createGenesisBlock('addr1', 100);
      await postBlock(genesis);

      const block2 = createTransferBlock(2, 'tx2', 'tx1', 0, [
        { address: 'addr2', value: 60 },
        { address: 'addr3', value: 40 }
      ]);
      await postBlock(block2);

      const block3 = createTransferBlock(3, 'tx3', 'tx2', 1, [
        { address: 'addr4', value: 20 },
        { address: 'addr5', value: 20 }
      ]);
      await postBlock(block3);

      // Verify initial state
      await expectBalance('addr2', 60);
      await expectBalance('addr3', 0);
      await expectBalance('addr4', 20);
      await expectBalance('addr5', 20);

      // Rollback to height 2
      const response = await rollback(2);
      expect(response.status).toBe(200);

      // Verify rollback worked
      await expectBalance('addr2', 60);
      await expectBalance('addr3', 40); // Should be restored
      await expectBalance('addr4', 0);  // Should be gone
      await expectBalance('addr5', 0);  // Should be gone
    });

    test('should reject invalid rollback height', async () => {
      const response = await rollback(0);
      expect(response.status).toBe(400);
    });
  });

  describe('README Example Integration Test', () => {
    test('should handle the exact example from README', async () => {
      // Block 1: addr1 gets 10
      const block1 = new BlockBuilder(1)
        .addTransaction(
          new TransactionBuilder('tx1')
            .addOutput('addr1', 10)
            .build()
        )
        .build();
      
      await postBlock(block1);
      await expectBalance('addr1', 10);

      // Block 2: addr1 -> addr2(4) + addr3(6)
      const block2 = new BlockBuilder(2)
        .addTransaction(
          new TransactionBuilder('tx2')
            .addInput('tx1', 0)
            .addOutput('addr2', 4)
            .addOutput('addr3', 6)
            .build()
        )
        .build();
      
      await postBlock(block2);
      await expectBalance('addr1', 0);
      await expectBalance('addr2', 4);
      await expectBalance('addr3', 6);

      // Block 3: addr3 -> addr4(2) + addr5(2) + addr6(2)
      const block3 = new BlockBuilder(3)
        .addTransaction(
          new TransactionBuilder('tx3')
            .addInput('tx2', 1)
            .addOutput('addr4', 2)
            .addOutput('addr5', 2)
            .addOutput('addr6', 2)
            .build()
        )
        .build();
      
      await postBlock(block3);
      await expectBalance('addr1', 0);
      await expectBalance('addr2', 4);
      await expectBalance('addr3', 0);
      await expectBalance('addr4', 2);
      await expectBalance('addr5', 2);
      await expectBalance('addr6', 2);

      // Rollback to height 2
      const response = await rollback(2);
      expect(response.status).toBe(200);

      // Verify rollback worked
      await expectBalance('addr1', 0);
      await expectBalance('addr2', 4);
      await expectBalance('addr3', 6);
      await expectBalance('addr4', 0);
      await expectBalance('addr5', 0);
      await expectBalance('addr6', 0);
    });
  });
});