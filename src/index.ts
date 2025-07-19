// src/index.ts
import { createApp } from './app';

async function start() {
  const databaseUrl = process.env.DATABASE_URL!;
  const { app, db } = await createApp(databaseUrl);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  const shutdown = async () => {
    console.log('🛑 Shutting down...');
    await db.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port, host });
  console.log(`🚀 Server listening at http://${host}:${port}`);
}

if (require.main === module) {
  start().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

// import Fastify from 'fastify';
// import { Database } from './databases';
// import { IndexerService } from './services/indexer';
// import { registerRoutes } from './routes';

// const fastify = Fastify({ 
//   logger: true,
//   disableRequestLogging: false
// });

// async function bootstrap() {
//   console.log('Bootstrapping blockchain indexer...');
  
//   const databaseUrl = process.env.DATABASE_URL;
//   if (!databaseUrl) {
//     throw new Error('DATABASE_URL environment variable is required');
//   }

//   // Initialize database
//   const db = new Database(databaseUrl);
//   await db.initialize();
//   console.log('Database initialized successfully');

//   // Initialize indexer service
//   const indexerService = new IndexerService(db);
//   console.log('Indexer service initialized');

//   // Register routes
//   await registerRoutes(fastify, indexerService);
//   console.log('Routes registered');

  // Graceful shutdown
  // process.on('SIGTERM', async () => {
  //   console.log('Received SIGTERM, shutting down gracefully...');
  //   await db.close();
  //   await fastify.close();
  //   process.exit(0);
  // });

  // process.on('SIGINT', async () => {
  //   console.log('Received SIGINT, shutting down gracefully...');
  //   await db.close();
  //   await fastify.close();
  //   process.exit(0);
  // });

//   return { fastify, db, indexerService };

// }

// async function start() {
//   try {
//     const { fastify: app } = bootstrap_instance;
    
//     const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
//     const host = process.env.HOST || '0.0.0.0';
    
//     await app.listen({ port, host });
//     console.log(`🚀 Blockchain indexer API running on http://${host}:${port}`);
    
//   } catch (err) {
//     console.error('Failed to start application:', err);
//     process.exit(1);
//   }
// }

// const bootstrap_instance = await bootstrap();
// // Only start if this file is run directly
// if (require.main === module) {
//   start();
// }

// export { bootstrap_instance };