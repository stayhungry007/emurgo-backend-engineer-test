// spec/api.spec.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Pool } from 'pg';
import { sha256 } from '../src/utils/hash';
import type { Block, Transaction, Output, Input } from '../src/interfaces/blockchain';

// Test database connection
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://myuser:mypassword@localhost:5432/mydatabase'
});

// Test server setup
const BASE_URL = 'http://localhost:3000';

describe('Blockchain Indexer API Tests', () => {
  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create test tables
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        block_height INT NOT NULL,
        inputs JSONB,
        outputs JSONB
      );
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS balances (
        address TEXT PRIMARY KEY,
        balance INT NOT NULL
      );
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        height INT NOT NULL
      );
    `);
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

  describe('POST /blocks', () => {
    test('should accept valid genesis block', async () => {
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      const response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.message).toBe('Block processed successfully');
    });

    test('should reject block with invalid height', async () => {
      const invalidBlock: Block = {
        id: sha256('3tx1'),
        height: 3, // Should be 1 for genesis
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      const response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidBlock)
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.message).toBe('Invalid block height');
    });

    test('should reject block with invalid block ID', async () => {
      const invalidBlock: Block = {
        id: 'wrong-hash',
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      const response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidBlock)
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.message).toBe('Invalid block ID');
    });

    test('should reject block with input/output sum mismatch', async () => {
      // First add genesis block
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      // Now try to add block with mismatched input/output
      const invalidBlock: Block = {
        id: sha256('2tx2'),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 150 // More than input (100)
          }]
        }]
      };

      const response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidBlock)
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.message).toBe('Input/output sum mismatch');
    });

    test('should process valid transaction chain', async () => {
      // Genesis block
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      let response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      expect(response.status).toBe(200);

      // Second block spending from genesis
      const secondBlock: Block = {
        id: sha256('2tx2'),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 60
          }, {
            address: 'addr3',
            value: 40
          }]
        }]
      };

      response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondBlock)
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /balance/:address', () => {
    test('should return balance for existing address', async () => {
      // Add a block first
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      const response = await fetch(`${BASE_URL}/balance/addr1`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance).toBe(100);
    });

    test('should return 404 for non-existent address', async () => {
      const response = await fetch(`${BASE_URL}/balance/nonexistent`);
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.message).toBe('Address not found');
    });

    test('should return correct balance after multiple transactions', async () => {
      // Genesis block
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      // Second block
      const secondBlock: Block = {
        id: sha256('2tx2'),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 60
          }, {
            address: 'addr3',
            value: 40
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondBlock)
      });

      // Check balances
      let response = await fetch(`${BASE_URL}/balance/addr1`);
      expect(response.status).toBe(404); // Should be 0 (spent)

      response = await fetch(`${BASE_URL}/balance/addr2`);
      expect(response.status).toBe(200);
      let data = await response.json();
      expect(data.balance).toBe(60);

      response = await fetch(`${BASE_URL}/balance/addr3`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(40);
    });
  });

  describe('POST /rollback', () => {
    test('should rollback to specified height', async () => {
      // Add multiple blocks
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      const secondBlock: Block = {
        id: sha256('2tx2'),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 60
          }, {
            address: 'addr3',
            value: 40
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondBlock)
      });

      const thirdBlock: Block = {
        id: sha256('3tx3'),
        height: 3,
        transactions: [{
          id: 'tx3',
          inputs: [{
            txId: 'tx2',
            index: 1
          }],
          outputs: [{
            address: 'addr4',
            value: 20
          }, {
            address: 'addr5',
            value: 20
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thirdBlock)
      });

      // Rollback to height 2
      const response = await fetch(`${BASE_URL}/rollback?height=2`, {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.message).toBe('Rollback successful');

      // Check that addr4 and addr5 no longer have balances
      let balanceResponse = await fetch(`${BASE_URL}/balance/addr4`);
      expect(balanceResponse.status).toBe(404);

      balanceResponse = await fetch(`${BASE_URL}/balance/addr5`);
      expect(balanceResponse.status).toBe(404);

      // Check that addr3 still has balance (should be restored)
      balanceResponse = await fetch(`${BASE_URL}/balance/addr3`);
      expect(balanceResponse.status).toBe(200);
      const balanceData = await balanceResponse.json();
      expect(balanceData.balance).toBe(40);
    });

    test('should reject rollback with invalid height', async () => {
      const response = await fetch(`${BASE_URL}/rollback?height=0`, {
        method: 'POST'
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.message).toBe('Invalid height');
    });

    test('should reject rollback to current or future height', async () => {
      // Add genesis block
      const genesisBlock: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 100
          }]
        }]
      };

      await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genesisBlock)
      });

      // Try to rollback to current height
      const response = await fetch(`${BASE_URL}/rollback?height=1`, {
        method: 'POST'
      });

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.message).toBe('Cannot roll back to the current or future height');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complex transaction flow as described in README', async () => {
      // Block 1: Genesis
      const block1: Block = {
        id: sha256('1tx1'),
        height: 1,
        transactions: [{
          id: 'tx1',
          inputs: [],
          outputs: [{
            address: 'addr1',
            value: 10
          }]
        }]
      };

      let response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block1)
      });
      expect(response.status).toBe(200);

      // Check addr1 balance
      response = await fetch(`${BASE_URL}/balance/addr1`);
      expect(response.status).toBe(200);
      let data = await response.json();
      expect(data.balance).toBe(10);

      // Block 2: Split addr1's balance
      const block2: Block = {
        id: sha256('2tx2'),
        height: 2,
        transactions: [{
          id: 'tx2',
          inputs: [{
            txId: 'tx1',
            index: 0
          }],
          outputs: [{
            address: 'addr2',
            value: 4
          }, {
            address: 'addr3',
            value: 6
          }]
        }]
      };

      response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block2)
      });
      expect(response.status).toBe(200);

      // Check balances after block 2
      response = await fetch(`${BASE_URL}/balance/addr1`);
      expect(response.status).toBe(404); // Balance should be 0

      response = await fetch(`${BASE_URL}/balance/addr2`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(4);

      response = await fetch(`${BASE_URL}/balance/addr3`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(6);

      // Block 3: Spend from addr3
      const block3: Block = {
        id: sha256('3tx3'),
        height: 3,
        transactions: [{
          id: 'tx3',
          inputs: [{
            txId: 'tx2',
            index: 1
          }],
          outputs: [{
            address: 'addr4',
            value: 2
          }, {
            address: 'addr5',
            value: 2
          }, {
            address: 'addr6',
            value: 2
          }]
        }]
      };

      response = await fetch(`${BASE_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block3)
      });
      expect(response.status).toBe(200);

      // Check final balances
      response = await fetch(`${BASE_URL}/balance/addr2`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(4);

      response = await fetch(`${BASE_URL}/balance/addr3`);
      expect(response.status).toBe(404); // Should be 0

      response = await fetch(`${BASE_URL}/balance/addr4`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(2);

      response = await fetch(`${BASE_URL}/balance/addr5`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(2);

      response = await fetch(`${BASE_URL}/balance/addr6`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(2);

      // Test rollback to height 2
      response = await fetch(`${BASE_URL}/rollback?height=2`, {
        method: 'POST'
      });
      expect(response.status).toBe(200);

      // Check balances after rollback
      response = await fetch(`${BASE_URL}/balance/addr2`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(4);

      response = await fetch(`${BASE_URL}/balance/addr3`);
      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.balance).toBe(6);

      // addr4, addr5, addr6 should no longer exist
      response = await fetch(`${BASE_URL}/balance/addr4`);
      expect(response.status).toBe(404);

      response = await fetch(`${BASE_URL}/balance/addr5`);
      expect(response.status).toBe(404);

      response = await fetch(`${BASE_URL}/balance/addr6`);
      expect(response.status).toBe(404);
    });
  });
});