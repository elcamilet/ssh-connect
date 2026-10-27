'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldRetry, retryDelayMs } = require('../../lib/retry');

const retry = { enabled: true, maxAttempts: 3, delaySeconds: 5 };

test('shouldRetry retries SSH connection failures while attempts remain', () => {
    assert.equal(shouldRetry(255, 1, retry), true);
    assert.equal(shouldRetry(255, 2, retry), true);
    assert.equal(shouldRetry(255, 3, retry), false);
});

test('shouldRetry ignores success, manual close and other exit codes', () => {
    assert.equal(shouldRetry(0, 1, retry), false);
    assert.equal(shouldRetry(undefined, 1, retry), false);
    assert.equal(shouldRetry(1, 1, retry), false);
});

test('shouldRetry respects disabled retry', () => {
    assert.equal(shouldRetry(255, 1, { ...retry, enabled: false }), false);
});

test('retryDelayMs returns configured delay', () => {
    assert.equal(retryDelayMs(retry), 5000);
});

test('retryDelayMs clamps delay to a safe range', () => {
    assert.equal(retryDelayMs({ delaySeconds: 0 }), 1000);
    assert.equal(retryDelayMs({ delaySeconds: 999 }), 300000);
    assert.equal(retryDelayMs({ delaySeconds: 'invalid' }), 5000);
});
