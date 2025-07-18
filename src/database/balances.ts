import { pool } from './db';

export async function updateBalance(address: string, value: number) {
  const res = await pool.query('SELECT balance FROM balances WHERE address = $1', [address]);

  if (res.rows.length > 0) {
    const currentBalance = res.rows[0].balance;
    await pool.query('UPDATE balances SET balance = $1 WHERE address = $2', [currentBalance + value, address]);
  } else {
    await pool.query('INSERT INTO balances (address, balance) VALUES ($1, $2)', [address, value]);
  }
}

export async function getBalance(address: string) {
  const res = await pool.query('SELECT balance FROM balances WHERE address = $1', [address]);
  return res.rows.length > 0 ? res.rows[0].balance : 0;
}

export async function recalculateBalances() {
  await pool.query('DELETE FROM balances');
  const transactions = await pool.query('SELECT * FROM transactions ORDER BY block_height');
  
  for (const tx of transactions.rows) {
    const inputs = JSON.parse(tx.inputs);
    const outputs = JSON.parse(tx.outputs);

    for (const output of outputs) {
      await updateBalance(output.address, output.value);
    }
  }
}
