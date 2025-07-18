import type { FastifyInstance } from 'fastify';
import { recalculateBalances } from '../database/balances';
import { getTransactionsByHeight } from '../database/transactions';
import { getCurrentHeight } from '../database/db';

export async function rollbackRoute(fastify: FastifyInstance) {
  fastify.post('/rollback', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          height: { type: 'number' },
        },
        required: ['height'],
      },
    },
  }, async (request, reply) => {
    const { height } = request.query as { height: number }

    if (typeof height !== 'number' || height <= 0) {
      return reply.status(400).send({ message: 'Invalid height' });
    }

    const currentHeight = await getCurrentHeight();
    if (height >= currentHeight) {
      return reply.status(400).send({ message: 'Cannot roll back to the current or future height' });
    }

    await recalculateBalances();
    return reply.status(200).send({ message: 'Rollback successful' });
  });
}
