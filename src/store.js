'use strict';

/**
 * In-memory account store.
 *
 * Balances live in a single Map (id -> balance). Keeping every read/write
 * behind this small API makes it obvious that nothing else mutates state,
 * and makes it easy to swap for a real database later.
 */
class AccountStore {
  constructor() {
    this.balances = new Map();
  }

  has(id) {
    return this.balances.has(id);
  }

  /** @returns {number|undefined} undefined when the account does not exist. */
  get(id) {
    return this.balances.get(id);
  }

  set(id, balance) {
    this.balances.set(id, balance);
  }

  reset() {
    this.balances.clear();
  }
}

module.exports = { AccountStore };
