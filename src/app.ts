// src/app.ts
import Fastify from 'fastify';
import { Database } from './databases';
import { IndexerService } from './services/indexer';
import { registerRoutes } from './routes';

export async function createApp(databaseUrl: string) {
  const app = Fastify({ logger: true, disableRequestLogging: false });
  const db = new Database(databaseUrl);
  await db.initialize();

  const indexerService = new IndexerService(db);
  await registerRoutes(app, { indexer: indexerService });

  app.setErrorHandler((err, req, reply) => {
    if (reply.sent) {
      req.log.warn('Tried to send error after response:', err);
      return;
    }
    req.log.error(err);
    reply.status(500).send({ error: 'Internal server error' });
  });

  return { app, db, indexerService };
}