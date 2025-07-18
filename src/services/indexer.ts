// src/services/indexer.ts

import { Database } from '../databases';
import { BlockValidator, validateBlockSchema } from '../validators';
import type { Block } from '../types';

export class IndexerService {
  private validator: BlockValidator;

  constructor(private db: Database) {
    this.validator = new BlockValidator(db);
  }

  async processBlock(blockData: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate schema first
      const schemaValidation = validateBlockSchema(blockData);
      if (!schemaValidation.isValid) {
        return { success: false, error: schemaValidation.error };
      }

      const block = blockData as Block;

      // Validate block logic
      const validation = await this.validator.validateBlock(block);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Save block to database
      await this.db.saveBlock(block);

      return { success: true };
    } catch (error) {
      console.error('Error processing block:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async getBalance(address: string): Promise<number> {
    if (!address || typeof address !== 'string') {
      throw new Error('Address must be a non-empty string');
    }

    return await this.db.getBalance(address);
  }

  async rollbackToHeight(height: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (typeof height !== 'number' || height < 0) {
        return { success: false, error: 'Height must be a non-negative number' };
      }

      const currentHeight = await this.db.getCurrentHeight();
      if (height > currentHeight) {
        return { success: false, error: `Cannot rollback to height ${height}, current height is ${currentHeight}` };
      }

      // Check if rollback is within allowed range (2000 blocks)
      if (currentHeight - height > 2000) {
        return { success: false, error: `Cannot rollback more than 2000 blocks. Current: ${currentHeight}, Target: ${height}` };
      }

      await this.db.rollbackToHeight(height);
      return { success: true };
    } catch (error) {
      console.error('Error during rollback:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async getCurrentHeight(): Promise<number> {
    return await this.db.getCurrentHeight();
  }
}