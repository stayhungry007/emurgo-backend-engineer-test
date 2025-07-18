import Fastify from 'fastify';
import { blocksRoute } from './routes/blocks';
import { balancesRoute } from './routes/balances';
import { rollbackRoute } from './routes/rollback';
import { helloworld } from './routes/helloworld';

import { createTables, testPostgres } from './database/db';
import { findAncestor } from 'typescript';

const fastify = Fastify({ logger: true });

async function bootstrap() {
  await createTables();
  await testPostgres();

  fastify.register(blocksRoute);
  fastify.register(balancesRoute);
  fastify.register(rollbackRoute);
  fastify.register(helloworld);

  console.log("Server is Running");
  await fastify.listen({
    port: 3000,
    host: '0.0.0.0',
  });
}

bootstrap().catch(err => {
  fastify.log.error(err);
  process.exit(1);
});


export function createApp() {
  const fastify_test = Fastify();

  fastify.register(blocksRoute);
  fastify.register(balancesRoute);
  fastify.register(rollbackRoute);

  return fastify_test;
}