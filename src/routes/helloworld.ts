import type { FastifyInstance } from 'fastify';

export async function helloworld(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    return { hello: 'world' };
  });
}
