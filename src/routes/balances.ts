import type { FastifyInstance } from 'fastify';
import { getBalance } from '../database/balances';

export async function balancesRoute(fastify: FastifyInstance) {
  fastify.get('/balance/:address', async (request, reply) => {
    const { address } = request.params;
    const balance = await getBalance(address);

    if (balance === 0) {
      return reply.status(404).send({ message: 'Address not found' });
    }

    return reply.status(200).send({ balance });
  });
}
