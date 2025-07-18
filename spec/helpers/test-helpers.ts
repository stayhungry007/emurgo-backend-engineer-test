// spec/helpers/test-helpers.ts

import { createHash } from 'crypto';
import type { Block, Transaction, Output, Input } from '../../src/types';

export function createTestBlock(
  height: number, 
  transactions: Transaction[],
  customId?: string
): Block {
  const transactionIds = transactions.map(tx => tx.id).sort();
  const concatenated = height.toString() + transactionIds.join('');
  const id = customId || createHash('sha256').update(concatenated).digest('hex');
  
  return {
    id,
    height,
    transactions
  };
}

export function createTestTransaction(
  id: string,
  inputs: Input[],
  outputs: Output[]
): Transaction {
  return {
    id,
    inputs,
    outputs
  };
}

export function createTestOutput(address: string, value: number): Output {
  return {
    address,
    value
  };
}

export function createTestInput(txId: string, index: number): Input {
  return {
    txId,
    index
  };
}

export function createGenesisBlock(address: string, value: number): Block {
  const tx = createTestTransaction(
    'genesis_tx',
    [],
    [createTestOutput(address, value)]
  );
  
  return createTestBlock(1, [tx]);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}