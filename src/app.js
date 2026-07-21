'use strict';

const Fastify = require('fastify');

const { AccountService } = require('./account-service');
const {
  DomainError,
  ACCOUNT_NOT_FOUND,
  INSUFFICIENT_FUNDS,
  INVALID_REQUEST,
} = require('./errors');

/**
 * HTTP layer: parses requests, delegates to the service, maps errors to
 * status codes. No business rule lives here.
 */
function buildApp(options = {}) {
  const { service = new AccountService(), logger = false } = options;
  const app = Fastify({ logger });

  // Used by the container health check.
  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/reset', async (request, reply) => {
    service.reset();
    return reply.code(200).send('OK');
  });

  // Read-only: never touches state.
  app.get('/balance', async (request, reply) => {
    const balance = service.getBalance(request.query.account_id);
    return reply.code(200).send(balance);
  });

  app.post('/event', async (request, reply) => {
    const { type, origin, destination, amount } = request.body ?? {};

    switch (type) {
      case 'deposit':
        return reply
          .code(201)
          .send({ destination: service.deposit(destination, amount) });

      case 'withdraw':
        return reply.code(201).send({ origin: service.withdraw(origin, amount) });

      case 'transfer':
        return reply.code(201).send(service.transfer(origin, destination, amount));

      default:
        throw new DomainError(
          INVALID_REQUEST,
          `unknown event type: ${JSON.stringify(type)}`
        );
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      // The spec requires a bare `0` body for a missing account.
      if (error.code === ACCOUNT_NOT_FOUND) {
        return reply.code(404).send(0);
      }
      const status = error.code === INSUFFICIENT_FUNDS ? 422 : 400;
      return reply
        .code(status)
        .send({ error: { code: error.code, message: error.message } });
    }

    // Malformed JSON body and other framework-level errors carry a status.
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: { code: INVALID_REQUEST, message: error.message },
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: 'Unknown route' } })
  );

  return app;
}

module.exports = { buildApp };
