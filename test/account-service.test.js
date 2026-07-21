'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AccountService } = require('../src/account-service');
const { ACCOUNT_NOT_FOUND, INSUFFICIENT_FUNDS, INVALID_REQUEST } = require('../src/errors');

/** Asserts the operation throws a DomainError with the given code. */
function assertDomainError(code, fn) {
  assert.throws(fn, (err) => err.name === 'DomainError' && err.code === code);
}

test('deposit creates the account and then increases its balance', () => {
  const service = new AccountService();

  assert.deepEqual(service.deposit('100', 10), { id: '100', balance: 10 });
  assert.deepEqual(service.deposit('100', 10), { id: '100', balance: 20 });
  assert.equal(service.getBalance('100'), 20);
});

test('withdraw reduces the balance', () => {
  const service = new AccountService();
  service.deposit('100', 20);

  assert.deepEqual(service.withdraw('100', 5), { id: '100', balance: 15 });
  assert.equal(service.getBalance('100'), 15);
});

test('withdraw from a non-existing account fails and creates nothing', () => {
  const service = new AccountService();

  assertDomainError(ACCOUNT_NOT_FOUND, () => service.withdraw('200', 10));
  assertDomainError(ACCOUNT_NOT_FOUND, () => service.getBalance('200'));
});

test('withdraw beyond the balance is rejected and leaves the balance untouched', () => {
  const service = new AccountService();
  service.deposit('100', 10);

  assertDomainError(INSUFFICIENT_FUNDS, () => service.withdraw('100', 11));
  assert.equal(service.getBalance('100'), 10);
});

test('transfer moves the amount from origin to destination', () => {
  const service = new AccountService();
  service.deposit('100', 15);

  assert.deepEqual(service.transfer('100', '300', 15), {
    origin: { id: '100', balance: 0 },
    destination: { id: '300', balance: 15 },
  });
  assert.equal(service.getBalance('100'), 0);
  assert.equal(service.getBalance('300'), 15);
});

test('transfer credits an existing destination instead of overwriting it', () => {
  const service = new AccountService();
  service.deposit('100', 50);
  service.deposit('300', 5);

  service.transfer('100', '300', 20);

  assert.equal(service.getBalance('100'), 30);
  assert.equal(service.getBalance('300'), 25);
});

test('a failed transfer leaves both accounts unchanged', () => {
  const service = new AccountService();
  service.deposit('100', 10);
  service.deposit('300', 7);

  assertDomainError(INSUFFICIENT_FUNDS, () => service.transfer('100', '300', 11));

  assert.equal(service.getBalance('100'), 10);
  assert.equal(service.getBalance('300'), 7);
});

test('transfer from a non-existing account does not create the destination', () => {
  const service = new AccountService();

  assertDomainError(ACCOUNT_NOT_FOUND, () => service.transfer('200', '300', 15));
  assertDomainError(ACCOUNT_NOT_FOUND, () => service.getBalance('300'));
});

test('getBalance does not change state', () => {
  const service = new AccountService();
  service.deposit('100', 10);

  service.getBalance('100');
  service.getBalance('100');

  assert.equal(service.getBalance('100'), 10);
});

test('invalid amounts are rejected before touching the store', () => {
  const service = new AccountService();
  service.deposit('100', 10);

  for (const amount of [0, -5, 1.5, '10', null, undefined, NaN]) {
    assertDomainError(INVALID_REQUEST, () => service.deposit('100', amount));
    assertDomainError(INVALID_REQUEST, () => service.withdraw('100', amount));
  }
  assert.equal(service.getBalance('100'), 10);
});

test('transferring to the same account is rejected', () => {
  const service = new AccountService();
  service.deposit('100', 10);

  assertDomainError(INVALID_REQUEST, () => service.transfer('100', '100', 5));
  assert.equal(service.getBalance('100'), 10);
});

test('reset clears every account', () => {
  const service = new AccountService();
  service.deposit('100', 10);

  service.reset();

  assertDomainError(ACCOUNT_NOT_FOUND, () => service.getBalance('100'));
});
