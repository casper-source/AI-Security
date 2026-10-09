import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertRoe } from '../adapters/index.mjs';

describe('assertRoe', () => {
  it('allows localhost and 127.0.0.1', () => {
    assert.doesNotThrow(() => assertRoe('http://localhost:8080/v1/chat'));
    assert.doesNotThrow(() => assertRoe('http://127.0.0.1:8080/'));
  });

  it('refuses remote hosts without authorization', () => {
    assert.throws(() => assertRoe('https://example.com/api'), /REFUSING non-localhost/);
  });

  it('allows allowlisted host when ROE_AUTHORIZED=1', () => {
    const prev = process.env.ROE_AUTHORIZED;
    const prevList = process.env.RC_TARGET_ALLOWLIST;
    process.env.ROE_AUTHORIZED = '1';
    process.env.RC_TARGET_ALLOWLIST = 'staging.example.com';
    try {
      assert.doesNotThrow(() => assertRoe('https://staging.example.com/v1/chat'));
    } finally {
      process.env.ROE_AUTHORIZED = prev;
      process.env.RC_TARGET_ALLOWLIST = prevList;
    }
  });
});
