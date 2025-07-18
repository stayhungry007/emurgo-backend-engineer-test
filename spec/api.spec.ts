// spec/api.spec.ts

import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { bootstrap_instance } from '../src/index';
import { Database } from '../src/databases';
import { IndexerService } from '../src/services/indexer';
import { createGenesisBlock, createTestBlock, createTestTransaction, createTestOutput, createTestInput } from './helpers/test-helpers';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let db: Database;
  let indexerService: IndexerService;
  
  beforeAll(async ()=> {
    app = bootstrap_instance.fastify;
    db = bootstrap_instance.db;
    indexerService = bootstrap_instance.indexerService;
    await cleanupTestData();
  });
  
  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await db.close();
  })

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

  describe('GET /', () => {
    it('should return health check information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.message).toBe('Blockchain indexer API');
      expect(body.currentHeight).toBe(0);
    });
  });

  describe('POST /blocks', () => {
    it('should accept and process a valid genesis block', async () => {
      const genesisBlock = createGenesisBlock('addr1', 100);
      
      const response = await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: genesisBlock
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Block processed successfully');
      
      // Verify block was stored
      const height = await indexerService.getCurrentHeight();
      expect(height).toBe(1);
    });

    it('should reject block with invalid height', async () => {
      const invalidBlock = createGenesisBlock('addr1', 100);
      invalidBlock.height = 5; // Invalid height
      
      const response = await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: invalidBlock
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Block validation failed');
      expect(body.message).toContain('Invalid height');
    });

    it('should reject block with invalid structure', async () => {
      const invalidBlock = {
        id: 'block1',
        height: 1,
        transactions: 'not_an_array'
      };
      
      const response = await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: invalidBlock
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Block validation failed');
      expect(body.message).toContain('transactions must be an array');
    });

    it('should process a chain of blocks correctly', async () => {
      // Process genesis block
      const genesisBlock = createGenesisBlock('addr1', 100);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: genesisBlock
      });

      // Process second block
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [
          createTestOutput('addr2', 60),
          createTestOutput('addr3', 40)
        ]
      );
      const block2 = createTestBlock(2, [tx2]);
      
      const response = await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: block2
      });

      expect(response.statusCode).toBe(201);
      
      // Verify final state
      const height = await indexerService.getCurrentHeight();
      expect(height).toBe(2);
    });
  });

  describe('GET /balance/:address', () => {
    beforeEach(async () => {
      // Set up test data
      const genesisBlock = createGenesisBlock('addr1', 100);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: genesisBlock
      });
    });

    it('should return correct balance for existing address', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/balance/addr1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe('addr1');
      expect(body.balance).toBe(100);
    });

    it('should return 0 balance for non-existent address', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/balance/nonexistent'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.address).toBe('nonexistent');
      expect(body.balance).toBe(0);
    });

    it('should return correct balance after transactions', async () => {
      // Transfer from addr1 to addr2
      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: block2
      });

      // Check balances
      const response1 = await app.inject({
        method: 'GET',
        url: '/balance/addr1'
      });
      expect(JSON.parse(response1.body).balance).toBe(0);

      const response2 = await app.inject({
        method: 'GET',
        url: '/balance/addr2'
      });
      expect(JSON.parse(response2.body).balance).toBe(100);
    });
  });

  describe('POST /rollback', () => {
    beforeEach(async () => {
      // Set up a chain of blocks
      const genesisBlock = createGenesisBlock('addr1', 100);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: genesisBlock
      });

      const tx2 = createTestTransaction(
        'tx2',
        [createTestInput('genesis_tx', 0)],
        [createTestOutput('addr2', 100)]
      );
      const block2 = createTestBlock(2, [tx2]);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: block2
      });

      const tx3 = createTestTransaction(
        'tx3',
        [createTestInput('tx2', 0)],
        [createTestOutput('addr3', 100)]
      );
      const block3 = createTestBlock(3, [tx3]);
      await app.inject({
        method: 'POST',
        url: '/blocks',
        payload: block3
      });
    });

    it('should rollback to specified height successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/rollback?height=2'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Successfully rolled back to height 2');
      
      // Verify rollback
      const height = await indexerService.getCurrentHeight();
      expect(height).toBe(2);
      
      // Verify balances
      const balance2 = await indexerService.getBalance('addr2');
      const balance3 = await indexerService.getBalance('addr3');
      expect(balance2).toBe(100);
      expect(balance3).toBe(0);
    });

    it('should reject rollback without height parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/rollback'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Missing height parameter');
    });

    it('should reject rollback with invalid height parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/rollback?height=invalid'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid height parameter');
    });

    it('should reject rollback to future height', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/rollback?height=10'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Rollback failed');
      expect(body.message).toContain('Cannot rollback to height 10');
    });
  });
});