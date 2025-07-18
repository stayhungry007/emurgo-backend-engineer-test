// src/types/index.ts

export interface Output {
  address: string;
  value: number;
}

export interface Input {
  txId: string;
  index: number;
}

export interface Transaction {
  id: string;
  inputs: Input[];
  outputs: Output[];
}

export interface Block {
  id: string;
  height: number;
  transactions: Transaction[];
}

export interface StoredOutput {
  txId: string;
  index: number;
  address: string;
  value: number;
  spent: boolean;
}

export interface Balance {
  address: string;
  balance: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface BlockchainState {
  currentHeight: number;
  balances: Map<string, number>;
  outputs: Map<string, StoredOutput>; // key: txId:index
}