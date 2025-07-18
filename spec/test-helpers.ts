// spec/test-helpers.ts
import { sha256 } from '../src/utils/hash';
import type { Block, Transaction, Output, Input } from '../src/interfaces/blockchain';

export const BASE_URL = 'http://localhost:3000';

export class BlockBuilder {
  private block: Partial<Block> = {};

  constructor(height: number) {
    this.block.height = height;
    this.block.transactions = [];
  }

  addTransaction(transaction: Transaction): BlockBuilder {
    if (!this.block.transactions) {
      this.block.transactions = [];
    }
    this.block.transactions.push(transaction);
    return this;
  }

  build(): Block {
    const txIds = this.block.transactions?.map(tx => tx.id).join('') || '';
    const blockId = sha256(`${this.block.height}${txIds}`);
    
    return {
      id: blockId,
      height: this.block.height!,
      transactions: this.block.transactions!
    };
  }
}

export class TransactionBuilder {
  private transaction: Partial<Transaction> = {};

  constructor(id: string) {
    this.transaction.id = id;
    this.transaction.inputs = [];
    this.transaction.outputs = [];
  }

  addInput(txId: string, index: number): TransactionBuilder {
    if (!this.transaction.inputs) {
      this.transaction.inputs = [];
    }
    this.transaction.inputs.push({ txId, index });
    return this;
  }

  addOutput(address: string, value: number): TransactionBuilder {
    if (!this.transaction.outputs) {
      this.transaction.outputs = [];
    }
    this.transaction.outputs.push({ address, value });
    return this;
  }

  build(): Transaction {
    return {
      id: this.transaction.id!,
      inputs: this.transaction.inputs!,
      outputs: this.transaction.outputs!
    };
  }
}

export async function postBlock(block: Block): Promise<Response> {
  return fetch(`${BASE_URL}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block)
  });
}

export async function getBalance(address: string): Promise<Response> {
  return fetch(`${BASE_URL}/balance/${address}`);
}

export async function rollback(height: number): Promise<Response> {
  return fetch(`${BASE_URL}/rollback?height=${height}`, {
    method: 'POST'
  });
}

export async function expectBalance(address: string, expectedBalance: number): Promise<{
  success: boolean;
  message?: string;
  actualBalance?: number;
  actualStatus?: number;
}> {
  const response = await getBalance(address);
  
  if (expectedBalance === 0) {
    if (response.status === 404) {
      return { success: true };
    } else {
      return { 
        success: false, 
        message: `Expected 404 for zero balance, got ${response.status}`,
        actualStatus: response.status
      };
    }
  } else {
    if (response.status === 200) {
      const data = await response.json();
      if (data.balance === expectedBalance) {
        return { success: true };
      } else {
        return { 
          success: false, 
          message: `Expected balance ${expectedBalance}, got ${data.balance}`,
          actualBalance: data.balance
        };
      }
    } else {
      return { 
        success: false, 
        message: `Expected 200 status, got ${response.status}`,
        actualStatus: response.status
      };
    }
  }
}


export function createGenesisBlock(address: string, value: number): Block {
  return new BlockBuilder(1)
    .addTransaction(
      new TransactionBuilder('tx1')
        .addOutput(address, value)
        .build()
    )
    .build();
}

export function createTransferBlock(
  height: number,
  txId: string,
  fromTxId: string,
  fromIndex: number,
  outputs: Array<{ address: string; value: number }>
): Block {
  const txBuilder = new TransactionBuilder(txId)
    .addInput(fromTxId, fromIndex);
  
  outputs.forEach(output => {
    txBuilder.addOutput(output.address, output.value);
  });

  return new BlockBuilder(height)
    .addTransaction(txBuilder.build())
    .build();
}