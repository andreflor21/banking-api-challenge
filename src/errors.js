'use strict';

/** Error the HTTP layer knows how to translate into a status code. */
class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND';
const INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS';
const INVALID_REQUEST = 'INVALID_REQUEST';

module.exports = {
  DomainError,
  ACCOUNT_NOT_FOUND,
  INSUFFICIENT_FUNDS,
  INVALID_REQUEST,
};
