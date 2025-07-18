// src/database/index.ts

import { Pool } from 'pg';
import type { Block, Transaction, StoredOutput, Balance } from '../types';

export class Database {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
  }

  async initialize() {
    await this.createTables();
  }

  private async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        height INTEGER UNIQUE NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL,
        block_height INTEGER NOT NULL,
        data JSONB NOT NULL,
        FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS outputs (
        tx_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        address TEXT NOT NULL,
        value NUMERIC NOT NULL,
        spent BOOLEAN DEFAULT FALSE,
        spent_in_tx TEXT,
        block_height INTEGER NOT NULL,
        PRIMARY KEY (tx_id, output_index)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS balances (
        address TEXT PRIMARY KEY,
        balance NUMERIC NOT NULL DEFAULT 0
      );
    `);

    // Create indexes for better performance
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks(height);
      CREATE INDEX IF NOT EXISTS idx_outputs_address ON outputs(address);
      CREATE INDEX IF NOT EXISTS idx_outputs_spent ON outputs(spent);
      CREATE INDEX IF NOT EXISTS idx_outputs_block_height ON outputs(block_height);
    `);
  }

  async saveBlock(block: Block): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Save block
      await client.query(
        'INSERT INTO blocks (id, height, data) VALUES ($1, $2, $3)',
        [block.id, block.height, JSON.stringify(block)]
      );

      // Save transactions
      for (const tx of block.transactions) {
        await client.query(
          'INSERT INTO transactions (id, block_id, block_height, data) VALUES ($1, $2, $3, $4)',
          [tx.id, block.id, block.height, JSON.stringify(tx)]
        );

        // Save outputs
        for (let i = 0; i < tx.outputs.length; i++) {
          const output = tx.outputs[i];
          await client.query(
            'INSERT INTO outputs (tx_id, output_index, address, value, block_height) VALUES ($1, $2, $3, $4, $5)',
            [tx.id, i, output.address, output.value, block.height]
          );
        }

        // Mark inputs as spent
        for (const input of tx.inputs) {
          await client.query(
            'UPDATE outputs SET spent = TRUE, spent_in_tx = $1 WHERE tx_id = $2 AND output_index = $3',
            [tx.id, input.txId, input.index]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentHeight(): Promise<number> {
    const result = await this.pool.query('SELECT MAX(height) as max_height FROM blocks');
    return result.rows[0].max_height || 0;
  }

  async getOutput(txId: string, index: number): Promise<StoredOutput | null> {
    const result = await this.pool.query(
      'SELECT * FROM outputs WHERE tx_id = $1 AND output_index = $2',
      [txId, index]
    );
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      txId: row.tx_id,
      index: row.output_index,
      address: row.address,
      value: parseFloat(row.value),
      spent: row.spent
    };
  }

  async getBalance(address: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN spent = FALSE THEN value ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN spent = TRUE THEN value ELSE 0 END), 0) as balance
       FROM outputs 
       WHERE address = $1`,
      [address]
    );
    
    return parseFloat(result.rows[0].balance) || 0;
  }

  async rollbackToHeight(height: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get all outputs that were spent in blocks after the target height
      const spentOutputs = await client.query(
        `SELECT DISTINCT o.tx_id, o.output_index 
         FROM outputs o 
         JOIN transactions t ON o.spent_in_tx = t.id 
         WHERE t.block_height > $1 AND o.spent = TRUE`,
        [height]
      );

      // Mark these outputs as unspent
      for (const row of spentOutputs.rows) {
        await client.query(
          'UPDATE outputs SET spent = FALSE, spent_in_tx = NULL WHERE tx_id = $1 AND output_index = $2',
          [row.tx_id, row.output_index]
        );
      }

      // Delete all outputs from blocks after the target height
      await client.query('DELETE FROM outputs WHERE block_height > $1', [height]);

      // Delete transactions from blocks after the target height
      await client.query('DELETE FROM transactions WHERE block_height > $1', [height]);

      // Delete blocks after the target height
      await client.query('DELETE FROM blocks WHERE height > $1', [height]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}