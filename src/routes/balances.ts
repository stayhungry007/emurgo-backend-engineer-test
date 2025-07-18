import type { FastifyInstance } from 'fastify';
import { getBalance } from '../database/balances';
import { Type } from '@sinclair/typebox';

export async function balancesRoute(fastify: FastifyInstance) {
  fastify.get('/balance/:address', {
    schema: {
      params: Type.Object({
        address: Type.String(), // Define the expected structure of the address param
      }),
    },
  }, async (request, reply) => {
    const { address } = request.params as { address: string }; // Now TypeScript knows this is a string

    const balance = await getBalance(address);

    if (balance === 0) {
      return reply.status(404).send({ message: 'Address not found' });
    }

    return reply.status(200).send({ balance });
  });
}
