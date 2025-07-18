import type { FastifyInstance } from 'fastify';
import type { Block } from '../interfaces/blockchain';
import { storeTransaction } from '../database/transactions';
import { updateBalance } from '../database/balances';
import { sha256 } from '../utils/hash';
import { BlockSchema } from '../schemas/blockSchema';
import { pool, getCurrentHeight } from '../database/db';

export async function blocksRoute(fastify: FastifyInstance) {
  fastify.post('/blocks', {
    schema: {
      body: BlockSchema,  // Define the body schema validation
    },
  }, async (request, reply) => {
    const block: Block = request.body as Block;  // Block should be typed as per the schema

    // Validate block height
    const currentHeight = await getCurrentHeight();
    if (block.height !== currentHeight + 1) {
      return reply.status(400).send({ message: 'Invalid block height' });
    }

    // Validate transaction input/output sums
    for (const transaction of block.transactions) {
      const inputSum = await getInputSum(transaction.inputs);
      const outputSum = transaction.outputs.reduce((sum, output) => sum + output.value, 0);

      if (inputSum !== outputSum) {
        return reply.status(400).send({ message: 'Input/output sum mismatch' });
      }
    }

    // Validate block ID
    const computedBlockId = await computeBlockId(block);
    if (computedBlockId !== block.id) {
      return reply.status(400).send({ message: 'Invalid block ID' });
    }

    // Process transactions
    for (const transaction of block.transactions) {
      await storeTransaction(transaction.id, block.height, transaction.inputs, transaction.outputs);
      for (const output of transaction.outputs) {
        await updateBalance(output.address, output.value);
      }
    }

    return reply.status(200).send({ message: 'Block processed successfully' });
  });
}

// Helper function to calculate the sum of inputs based on their referenced outputs
async function getInputSum(inputs: any[]) {
  let inputSum = 0;
  for (const input of inputs) {
    // Fetch the referenced output by txId and index
    const res = await pool.query(
      'SELECT outputs FROM transactions WHERE id = $1 AND block_height < $2 LIMIT 1',
      [input.txId, await getCurrentHeight()]
    );

    if (res.rows.length > 0) {
      const transactionOutputs = JSON.parse(res.rows[0].outputs);
      const referencedOutput = transactionOutputs[input.index];

      if (referencedOutput) {
        inputSum += referencedOutput.value;
      }
    }
  }
  return inputSum;
}

async function computeBlockId(block: Block) {
  const txIds = block.transactions.map(tx => tx.id).join('');
  return sha256(`${block.height}${txIds}`);
}
