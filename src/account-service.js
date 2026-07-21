'use strict';

const { AccountStore } = require('./store');
const {
  DomainError,
  ACCOUNT_NOT_FOUND,
  INSUFFICIENT_FUNDS,
  INVALID_REQUEST,
} = require('./errors');

/**
 * Business rules for accounts. Knows nothing about HTTP.
 *
 * Every operation validates first and only then writes, so a rejected
 * operation never leaves partial state behind (this is what makes a
 * transfer atomic: both writes happen, or neither does).
 */
class AccountService {
  constructor(store = new AccountStore()) {
    this.store = store;
  }

  /** Read-only. Throws when the account does not exist. */
  getBalance(accountId) {
    const id = normalizeId(accountId);
    if (!this.store.has(id)) {
      throw new DomainError(ACCOUNT_NOT_FOUND, `Account ${id} does not exist`);
    }
    return this.store.get(id);
  }

  /** Creates the account when it does not exist yet. */
  deposit(destinationId, rawAmount) {
    const id = normalizeId(destinationId);
    const amount = normalizeAmount(rawAmount);

    const balance = (this.store.get(id) ?? 0) + amount;
    this.store.set(id, balance);

    return { id, balance };
  }

  withdraw(originId, rawAmount) {
    const id = normalizeId(originId);
    const amount = normalizeAmount(rawAmount);
    const current = this.requireAccount(id);

    if (current < amount) {
      throw new DomainError(
        INSUFFICIENT_FUNDS,
        `Account ${id} has insufficient funds`
      );
    }

    const balance = current - amount;
    this.store.set(id, balance);

    return { id, balance };
  }

  transfer(originId, destinationId, rawAmount) {
    const from = normalizeId(originId);
    const to = normalizeId(destinationId);
    const amount = normalizeAmount(rawAmount);

    if (from === to) {
      throw new DomainError(
        INVALID_REQUEST,
        'origin and destination must be different'
      );
    }

    const originBalance = this.requireAccount(from);
    if (originBalance < amount) {
      throw new DomainError(
        INSUFFICIENT_FUNDS,
        `Account ${from} has insufficient funds`
      );
    }

    // Both writes happen after all validation, with nothing in between
    // that could throw, so origin and destination stay consistent.
    const destinationBalance = (this.store.get(to) ?? 0) + amount;
    this.store.set(from, originBalance - amount);
    this.store.set(to, destinationBalance);

    return {
      origin: { id: from, balance: originBalance - amount },
      destination: { id: to, balance: destinationBalance },
    };
  }

  reset() {
    this.store.reset();
  }

  requireAccount(id) {
    if (!this.store.has(id)) {
      throw new DomainError(ACCOUNT_NOT_FOUND, `Account ${id} does not exist`);
    }
    return this.store.get(id);
  }
}

/** Account ids are opaque strings; numbers are accepted and normalized. */
function normalizeId(value) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new DomainError(INVALID_REQUEST, 'account id must be a non-empty string');
}

/** Amounts are positive integers (smallest currency unit) — see README. */
function normalizeAmount(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainError(INVALID_REQUEST, 'amount must be a positive integer');
  }
  return value;
}

module.exports = { AccountService };
