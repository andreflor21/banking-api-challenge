'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildApp } = require('../src/app');

/** A fresh app (and therefore a fresh store) per test. */
function newApp(t) {
  const app = buildApp();
  t.after(() => app.close());
  return app;
}

const event = (app, payload) =>
  app.inject({ method: 'POST', url: '/event', payload });

const balance = (app, accountId) =>
  app.inject({ method: 'GET', url: `/balance?account_id=${accountId}` });

test('full flow from the specification', async (t) => {
  const app = newApp(t);

  const reset = await app.inject({ method: 'POST', url: '/reset' });
  assert.equal(reset.statusCode, 200);

  // Balance of a non-existing account.
  let res = await balance(app, '1234');
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '0');

  // Create account 100 with an initial deposit.
  res = await event(app, { type: 'deposit', destination: '100', amount: 10 });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { destination: { id: '100', balance: 10 } });

  // Deposit into the existing account.
  res = await event(app, { type: 'deposit', destination: '100', amount: 10 });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { destination: { id: '100', balance: 20 } });

  // Balance of an existing account.
  res = await balance(app, '100');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '20');

  // Withdraw from a non-existing account.
  res = await event(app, { type: 'withdraw', origin: '200', amount: 10 });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '0');

  // Withdraw from the existing account.
  res = await event(app, { type: 'withdraw', origin: '100', amount: 5 });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { origin: { id: '100', balance: 15 } });

  // Transfer from an existing account.
  res = await event(app, {
    type: 'transfer',
    origin: '100',
    amount: 15,
    destination: '300',
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), {
    origin: { id: '100', balance: 0 },
    destination: { id: '300', balance: 15 },
  });

  // Transfer from a non-existing account.
  res = await event(app, {
    type: 'transfer',
    origin: '200',
    amount: 15,
    destination: '300',
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '0');

  // State after the whole flow.
  assert.equal((await balance(app, '100')).body, '0');
  assert.equal((await balance(app, '300')).body, '15');
});

test('GET /balance never changes state', async (t) => {
  const app = newApp(t);
  await event(app, { type: 'deposit', destination: '100', amount: 10 });

  for (let i = 0; i < 5; i++) {
    assert.equal((await balance(app, '100')).body, '10');
  }
});

test('POST /reset clears the accounts', async (t) => {
  const app = newApp(t);
  await event(app, { type: 'deposit', destination: '100', amount: 10 });

  await app.inject({ method: 'POST', url: '/reset' });

  const res = await balance(app, '100');
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '0');
});

test('POST /reset accepts an empty JSON body', async (t) => {
  const app = newApp(t);
  await event(app, { type: 'deposit', destination: '100', amount: 10 });

  const res = await app.inject({
    method: 'POST',
    url: '/reset',
    headers: { 'content-type': 'application/json' },
    payload: '',
  });

  assert.equal(res.statusCode, 200);
  assert.equal((await balance(app, '100')).statusCode, 404);
});

test('a malformed JSON body is rejected with 400', async (t) => {
  const app = newApp(t);

  const res = await app.inject({
    method: 'POST',
    url: '/event',
    headers: { 'content-type': 'application/json' },
    payload: '{"type":"deposit",',
  });

  assert.equal(res.statusCode, 400);
});

test('withdrawing more than the balance returns 422 and keeps the balance', async (t) => {
  const app = newApp(t);
  await event(app, { type: 'deposit', destination: '100', amount: 10 });

  const res = await event(app, { type: 'withdraw', origin: '100', amount: 11 });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'INSUFFICIENT_FUNDS');

  assert.equal((await balance(app, '100')).body, '10');
});

test('a failed transfer leaves origin and destination unchanged', async (t) => {
  const app = newApp(t);
  await event(app, { type: 'deposit', destination: '100', amount: 10 });
  await event(app, { type: 'deposit', destination: '300', amount: 7 });

  const res = await event(app, {
    type: 'transfer',
    origin: '100',
    destination: '300',
    amount: 999,
  });
  assert.equal(res.statusCode, 422);

  assert.equal((await balance(app, '100')).body, '10');
  assert.equal((await balance(app, '300')).body, '7');
});

test('invalid events are rejected with 400', async (t) => {
  const app = newApp(t);

  const invalidPayloads = [
    { type: 'unknown', destination: '100', amount: 10 },
    { type: 'deposit', destination: '100', amount: -10 },
    { type: 'deposit', destination: '100', amount: 0 },
    { type: 'deposit', destination: '100' },
    { type: 'deposit', amount: 10 },
  ];

  for (const payload of invalidPayloads) {
    const res = await event(app, payload);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(payload)}`);
  }

  // Nothing was created by any of the rejected events.
  assert.equal((await balance(app, '100')).statusCode, 404);
});

test('concurrent deposits on the same account are all persisted', async (t) => {
  const app = newApp(t);

  await Promise.all(
    Array.from({ length: 50 }, () =>
      event(app, { type: 'deposit', destination: '100', amount: 1 })
    )
  );

  assert.equal((await balance(app, '100')).body, '50');
});
