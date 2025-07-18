// src/validators/index.ts

import { createHash } from 'crypto';
import type { Block, Transaction, Input, Output } from '../types';
import { Database } from '../databases';

export class BlockValidator {
  constructor(private db: Database) {}

  async validateBlock(block: Block): Promise<{ isValid: boolean; error?: string }> {
    // Validate height
    const heightValidation = await this.validateHeight(block.height);
    if (!heightValidation.isValid) {
      return heightValidation;
    }

    // Validate block ID
    const idValidation = this.validateBlockId(block);
    if (!idValidation.isValid) {
      return idValidation;
    }

    // Validate transactions
    for (const transaction of block.transactions) {
      const txValidation = await this.validateTransaction(transaction);
      if (!txValidation.isValid) {
        return txValidation;
      }
    }

    return { isValid: true };
  }

  private async validateHeight(height: number): Promise<{ isValid: boolean; error?: string }> {
    const currentHeight = await this.db.getCurrentHeight();
    
    if (height !== currentHeight + 1) {
      return {
        isValid: false,
        error: `Invalid height. Expected ${currentHeight + 1}, got ${height}`
      };
    }

    return { isValid: true };
  }

  private validateBlockId(block: Block): { isValid: boolean; error?: string } {
    const transactionIds = block.transactions.map(tx => tx.id).sort();
    const concatenated = block.height.toString() + transactionIds.join('');
    const expectedId = createHash('sha256').update(concatenated).digest('hex');

    if (block.id !== expectedId) {
      return {
        isValid: false,
        error: `Invalid block ID. Expected ${expectedId}, got ${block.id}`
      };
    }

    return { isValid: true };
  }

  private async validateTransaction(transaction: Transaction): Promise<{ isValid: boolean; error?: string }> {
    let inputSum = 0;
    let outputSum = 0;

    // Calculate input sum and validate inputs exist
    for (const input of transaction.inputs) {
      const output = await this.db.getOutput(input.txId, input.index);
      
      if (!output) {
        return {
          isValid: false,
          error: `Referenced output not found: ${input.txId}:${input.index}`
        };
      }

      if (output.spent) {
        return {
          isValid: false,
          error: `Output already spent: ${input.txId}:${input.index}`
        };
      }

      inputSum += output.value;
    }

    // Calculate output sum
    for (const output of transaction.outputs) {
      if (output.value < 0) {
        return {
          isValid: false,
          error: `Negative output value not allowed: ${output.value}`
        };
      }
      outputSum += output.value;
    }

    // Validate input sum equals output sum
    if (inputSum !== outputSum) {
      return {
        isValid: false,
        error: `Input sum (${inputSum}) does not equal output sum (${outputSum})`
      };
    }

    return { isValid: true };
  }
}

export function validateBlockSchema(data: any): { isValid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Block must be an object' };
  }

  if (typeof data.id !== 'string' || !data.id) {
    return { isValid: false, error: 'Block ID must be a non-empty string' };
  }

  if (typeof data.height !== 'number' || data.height < 1) {
    return { isValid: false, error: 'Block height must be a positive number' };
  }

  if (!Array.isArray(data.transactions)) {
    return { isValid: false, error: 'Block transactions must be an array' };
  }

  for (let i = 0; i < data.transactions.length; i++) {
    const tx = data.transactions[i];
    const txValidation = validateTransactionSchema(tx);
    if (!txValidation.isValid) {
      return { isValid: false, error: `Transaction ${i}: ${txValidation.error}` };
    }
  }

  return { isValid: true };
}

function validateTransactionSchema(tx: any): { isValid: boolean; error?: string } {
  if (!tx || typeof tx !== 'object') {
    return { isValid: false, error: 'Transaction must be an object' };
  }

  if (typeof tx.id !== 'string' || !tx.id) {
    return { isValid: false, error: 'Transaction ID must be a non-empty string' };
  }

  if (!Array.isArray(tx.inputs)) {
    return { isValid: false, error: 'Transaction inputs must be an array' };
  }

  if (!Array.isArray(tx.outputs)) {
    return { isValid: false, error: 'Transaction outputs must be an array' };
  }

  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    if (!input || typeof input !== 'object') {
      return { isValid: false, error: `Input ${i} must be an object` };
    }
    if (typeof input.txId !== 'string' || !input.txId) {
      return { isValid: false, error: `Input ${i} txId must be a non-empty string` };
    }
    if (typeof input.index !== 'number' || input.index < 0) {
      return { isValid: false, error: `Input ${i} index must be a non-negative number` };
    }
  }

  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    if (!output || typeof output !== 'object') {
      return { isValid: false, error: `Output ${i} must be an object` };
    }
    if (typeof output.address !== 'string' || !output.address) {
      return { isValid: false, error: `Output ${i} address must be a non-empty string` };
    }
    if (typeof output.value !== 'number' || output.value < 0) {
      return { isValid: false, error: `Output ${i} value must be a non-negative number` };
    }
  }

  return { isValid: true };
}