// src/routes/index.ts

import type { FastifyInstance } from 'fastify';
import { IndexerService } from '../services/indexer';

export async function registerRoutes(app: FastifyInstance, opts: { indexer: IndexerService }) {
  app.get('/', async (req, reply) => {
    try {
      const height = await opts.indexer.getCurrentHeight();
      return reply.code(200).send({
        status: 'healthy',
        message: 'Blockchain indexer API',
        currentHeight: height,
      });
    } catch (err: any) {
      req.log.error(err);
      if (!reply.sent) {
        return reply.code(500).send({ error: 'Failed to get status' });
      }
    }
  });

  app.post('/blocks', async (req, reply) => {
    try {
      const block = req.body as any;
      const result = await opts.indexer.processBlock(block);

      if (!result.success) {
        return reply.code(400).send({ error: result.error || 'Invalid block data' });
      }

      return reply.code(201).send({ success: true });
    } catch (err: any) {
      req.log.error(err);
      if (!reply.sent) {
        return reply.code(500).send({ error: 'Failed to process block' });
      }
    }
  });

  app.setErrorHandler((error, req, reply) => {
    req.log.error(error, 'GLOBAL_ERROR');
    if (!reply.sent) {
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
}






// import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// import { IndexerService } from '../services/indexer';

// export async function registerRoutes(fastify: FastifyInstance, indexerService: IndexerService) {
//   // Health check endpoint
//   fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
//     try {
//       const currentHeight = await indexerService.getCurrentHeight();
//       reply.status(200).send({ 
//         status: 'healthy',
//         message: 'Blockchain indexer API',
//         currentHeight
//       });
//     } catch (error) {
//       fastify.log.error(error);
//       reply.status(500).send({
//         error: 'Internal server error'
//       });
//     }
//   });

//   // Process new block
//   fastify.post('/blocks', async (request: FastifyRequest, reply: FastifyReply) => {
//     try {
//       const result = await indexerService.processBlock(request.body);
      
//       if (!result.success) {
//         return reply.status(400).send({
//           error: 'Block validation failed',
//           message: result.error
//         });
//       }

//       return reply.status(201).send({
//         success: true,
//         message: 'Block processed successfully'
//       });
//     } catch (error) {
//       console.error('Error in POST /blocks:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });

//   // Get balance for an address
//   fastify.get<{
//     Params: { address: string }
//   }>('/balance/:address', async (request: FastifyRequest<{
//     Params: { address: string }
//   }>, reply: FastifyReply) => {
//     try {
//       const { address } = request.params;
      
//       if (!address || typeof address !== 'string') {
//         reply.status(400).send({
//           error: 'Invalid address',
//           message: 'Address must be a non-empty string'
//         });
//         return;
//       }

//       const balance = await indexerService.getBalance(address);
      
//       reply.send({
//         address,
//         balance
//       });
//     } catch (error) {
//       console.error('Error in GET /balance/:address:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });

//   // Rollback to specific height
//   fastify.post<{
//     Querystring: { height: string }
//   }>('/rollback', async (request: FastifyRequest<{
//     Querystring: { height: string }
//   }>, reply: FastifyReply) => {
//     try {
//       const heightParam = request.query.height;
      
//       if (!heightParam) {
//         reply.status(400).send({
//           error: 'Missing height parameter',
//           message: 'Height query parameter is required'
//         });
//         return;
//       }

//       const height = parseInt(heightParam, 10);
      
//       if (isNaN(height)) {
//         reply.status(400).send({
//           error: 'Invalid height parameter',
//           message: 'Height must be a valid number'
//         });// src/routes/index.ts

// import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// import { IndexerService } from '../services/indexer';

// export async function registerRoutes(fastify: FastifyInstance, indexerService: IndexerService) {
//   // Health check endpoint
//   fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
//     try {
//       const currentHeight = await indexerService.getCurrentHeight();
//       reply.status(200).send({ 
//         status: 'healthy',
//         message: 'Blockchain indexer API',
//         currentHeight
//       });
//     } catch (error) {
//       fastify.log.error(error);
//       reply.status(500).send({
//         error: 'Internal server error'
//       });
//     }
//   });

//   // Process new block
//   fastify.post('/blocks', async (request: FastifyRequest, reply: FastifyReply) => {
//     try {
//       const result = await indexerService.processBlock(request.body);
      
//       if (!result.success) {
//         return reply.status(400).send({
//           error: 'Block validation failed',
//           message: result.error
//         });
//       }

//       return reply.status(201).send({
//         success: true,
//         message: 'Block processed successfully'
//       });
//     } catch (error) {
//       console.error('Error in POST /blocks:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });

//   // Get balance for an address
//   fastify.get<{
//     Params: { address: string }
//   }>('/balance/:address', async (request: FastifyRequest<{
//     Params: { address: string }
//   }>, reply: FastifyReply) => {
//     try {
//       const { address } = request.params;
      
//       if (!address || typeof address !== 'string') {
//         reply.status(400).send({
//           error: 'Invalid address',
//           message: 'Address must be a non-empty string'
//         });
//         return;
//       }

//       const balance = await indexerService.getBalance(address);
      
//       reply.send({
//         address,
//         balance
//       });
//     } catch (error) {
//       console.error('Error in GET /balance/:address:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });

//   // Rollback to specific height
//   fastify.post<{
//     Querystring: { height: string }
//   }>('/rollback', async (request: FastifyRequest<{
//     Querystring: { height: string }
//   }>, reply: FastifyReply) => {
//     try {
//       const heightParam = request.query.height;
      
//       if (!heightParam) {
//         reply.status(400).send({
//           error: 'Missing height parameter',
//           message: 'Height query parameter is required'
//         });
//         return;
//       }

//       const height = parseInt(heightParam, 10);
      
//       if (isNaN(height)) {
//         reply.status(400).send({
//           error: 'Invalid height parameter',
//           message: 'Height must be a valid number'
//         });
//         return;
//       }

//       const result = await indexerService.rollbackToHeight(height);
      
//       if (!result.success) {
//         reply.status(400).send({
//           error: 'Rollback failed',
//           message: result.error
//         });
//         return;
//       }

//       reply.send({
//         success: true,
//         message: `Successfully rolled back to height ${height}`
//       });
//     } catch (error) {
//       console.error('Error in POST /rollback:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });
// }
//         return;
//       }

//       const result = await indexerService.rollbackToHeight(height);
      
//       if (!result.success) {
//         reply.status(400).send({
//           error: 'Rollback failed',
//           message: result.error
//         });
//         return;
//       }

//       reply.send({
//         success: true,
//         message: `Successfully rolled back to height ${height}`
//       });
//     } catch (error) {
//       console.error('Error in POST /rollback:', error);
//       reply.status(500).send({
//         error: 'Internal server error',
//         message: 'An unexpected error occurred'
//       });
//     }
//   });
// }