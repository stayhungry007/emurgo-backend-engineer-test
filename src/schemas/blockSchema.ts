import { Type } from '@sinclair/typebox';

export const OutputSchema = Type.Object({
  address: Type.String(),
  value: Type.Number(),
});

export const InputSchema = Type.Object({
  txId: Type.String(),
  index: Type.Number(),
});

export const TransactionSchema = Type.Object({
  id: Type.String(),
  inputs: Type.Array(InputSchema),
  outputs: Type.Array(OutputSchema),
});

export const BlockSchema = Type.Object({
  id: Type.String(),
  height: Type.Number(),
  transactions: Type.Array(TransactionSchema),
});
