import { pool } from './db';

export async function storeTransaction(txId: string, blockHeight: number, inputs: any, outputs: any) {
  await pool.query(`
    INSERT INTO transactions (id, block_height, inputs, outputs)
    VALUES ($1, $2, $3, $4);
  `, [txId, blockHeight, JSON.stringify(inputs), JSON.stringify(outputs)]);
}

export async function getTransactionsByHeight(height: number) {
  const res = await pool.query('SELECT * FROM transactions WHERE block_height = $1', [height]);
  return res.rows;
}
