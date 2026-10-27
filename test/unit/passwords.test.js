'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PasswordStore, PREFIX } = require('../../lib/passwords');

class FakeSecrets {
    constructor() {
        this.values = new Map();
    }

    get(key) {
        return Promise.resolve(this.values.get(key));
    }

    store(key, value) {
        this.values.set(key, value);
        return Promise.resolve();
    }

    delete(key) {
        this.values.delete(key);
        return Promise.resolve();
    }
}

function connection(overrides = {}) {
    return {
        user: 'deploy',
        host: 'example.com',
        port: 2222,
        ...overrides
    };
}

test('PasswordStore uses namespaced host and group keys', () => {
    const store = new PasswordStore(new FakeSecrets());
    assert.equal(
        store.hostKey(connection()),
        `${PREFIX}.host.deploy@example.com:2222`
    );
    assert.equal(store.groupKey('Development'), `${PREFIX}.group.Development`);
});

test('PasswordStore saves, reads and deletes a host password', async () => {
    const store = new PasswordStore(new FakeSecrets());
    const host = connection();
    assert.equal(await store.getHost(host), undefined);
    await store.saveHost(host, 'secret');
    assert.equal(await store.getHost(host), 'secret');
    await store.deleteHost(host);
    assert.equal(await store.getHost(host), undefined);
});

test('PasswordStore saves, reads and deletes a group password', async () => {
    const store = new PasswordStore(new FakeSecrets());
    assert.equal(await store.getGroup('Development'), undefined);
    await store.saveGroup('Development', 'group-secret');
    assert.equal(await store.getGroup('Development'), 'group-secret');
    await store.deleteGroup('Development');
    assert.equal(await store.getGroup('Development'), undefined);
});

test('PasswordStore differentiates users and ports', async () => {
    const store = new PasswordStore(new FakeSecrets());
    const first = connection({ user: 'deploy', port: 2222 });
    const second = connection({ user: 'admin', port: 22 });
    await store.saveHost(first, 'first');
    await store.saveHost(second, 'second');
    assert.equal(await store.getHost(first), 'first');
    assert.equal(await store.getHost(second), 'second');
});

test('PasswordStore rejects a missing SecretStorage instance', () => {
    assert.throws(() => new PasswordStore(undefined), /SecretStorage/);
});
