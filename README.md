# Banking API — EBANX technical assignment

Simple banking API with in-memory state: deposits, withdrawals and transfers.

## Requirements

- Node.js 18+ (developed on Node 24)

## Running

```bash
npm install
npm start          # http://localhost:3000
```

The port can be changed with `PORT=8080 npm start`.

## Tests

```bash
npm test
```

Uses the built-in Node test runner — no test framework dependency.

## Endpoints

| Method | Path                       | Description                              |
| ------ | -------------------------- | ---------------------------------------- |
| POST   | `/reset`                   | Clears all accounts                      |
| GET    | `/balance?account_id=100`  | Returns the balance (read-only)          |
| POST   | `/event`                   | `deposit`, `withdraw` or `transfer`      |
| GET    | `/health`                  | Health check used by the container       |

```bash
curl -X POST localhost:3000/reset

curl -X POST localhost:3000/event -H 'Content-Type: application/json' \
  -d '{"type":"deposit","destination":"100","amount":10}'
# 201 {"destination":{"id":"100","balance":10}}

curl -X POST localhost:3000/event -H 'Content-Type: application/json' \
  -d '{"type":"withdraw","origin":"100","amount":5}'
# 201 {"origin":{"id":"100","balance":5}}

curl -X POST localhost:3000/event -H 'Content-Type: application/json' \
  -d '{"type":"transfer","origin":"100","amount":5,"destination":"300"}'
# 201 {"origin":{"id":"100","balance":0},"destination":{"id":"300","balance":5}}

curl 'localhost:3000/balance?account_id=100'
# 200 0
```

## Docker

```bash
docker build -t banking-api .
docker run -p 3000:3000 banking-api
```

The image is also what the deployment uses: `PORT` defaults to `3000` and the
server binds to `0.0.0.0`. Health check path: `/health`.

## Structure

```
src/
  account-service.js   business rules (deposit / withdraw / transfer)
  store.js             in-memory account storage
  errors.js            domain errors
  app.js               HTTP layer (Fastify routes + error mapping)
  server.js            entry point
test/
  account-service.test.js   unit tests over real state
  api.test.js               end-to-end tests over HTTP
```

## Decisions

- **Business logic is isolated from HTTP.** `AccountService` knows nothing about
  requests or status codes; `app.js` only parses input, calls the service and
  maps domain errors to status codes. The service is unit-testable without a
  server, and the HTTP layer can change without touching business rules.
- **State lives in a `Map` behind a small store.** Every read and write goes
  through it, so it is easy to see that nothing else mutates state — and easy to
  replace with a database later.
- **Transfers are atomic.** All validation (account exists, sufficient funds)
  happens before any write, and the two writes are consecutive synchronous
  statements with nothing in between that can throw. A rejected transfer leaves
  both accounts untouched — covered by tests.
- **`GET /balance` has no side effects.** It only reads; a dedicated test asserts
  repeated reads never change the balance.
- **Amounts are positive integers** representing the smallest currency unit.
  This avoids floating-point rounding corrupting balances. Anything else
  (`0`, negatives, decimals, strings) is rejected with `400` before any write.
- **Account ids are strings**, normalized from numbers when needed, so `100` and
  `"100"` refer to the same account.
- **Response format.** The spec requires a bare `0` body with `404` for a missing
  account, so that case is kept exactly as specified. Every other error uses a
  uniform shape:

  ```json
  { "error": { "code": "INSUFFICIENT_FUNDS", "message": "..." } }
  ```

  with `422` for insufficient funds and `400` for invalid input.
- **No persistence, no auth, no concurrency control.** The spec does not ask for
  them, and Node's single-threaded event loop already serializes each request
  handler, so the in-memory state stays consistent.
