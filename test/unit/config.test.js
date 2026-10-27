'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ConfigError,
    LEGACY_SHELL_MESSAGE,
    parseConfig,
    formatTerminalName,
    resolveConnection
} = require('../../lib/config');

function parse(config) {
    return parseConfig(JSON.stringify(config)).config;
}

function baseConfig() {
    return {
        groups: [
            {
                name: 'Development',
                defaultUser: 'deploy',
                defaultPort: 2222,
                defaultIdentityFile: '~/.ssh/dev',
                hosts: [
                    {
                        name: 'Dev 1',
                        host: 'dev.example.com'
                    }
                ]
            }
        ]
    };
}

test('parseConfig accepts a minimal valid configuration', () => {
    const result = parseConfig(JSON.stringify(baseConfig()));
    assert.deepEqual(result.warnings, []);
    assert.equal(result.config.groups.length, 1);
});

test('parseConfig rejects invalid JSON', () => {
    assert.throws(() => parseConfig('{'), ConfigError);
});

test('parseConfig rejects missing groups', () => {
    assert.throws(() => parseConfig('{}'), ConfigError);
});

test('parseConfig validates required host fields', () => {
    assert.throws(
        () => parseConfig(JSON.stringify({ groups: [{ name: 'Dev', hosts: [{}] }] })),
        ConfigError
    );
});

test('parseConfig validates port range', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].port = 70000;
    assert.throws(() => parseConfig(JSON.stringify(config)), ConfigError);
});

test('parseConfig validates retry limits', () => {
    const config = baseConfig();
    config.groups[0].retry = { enabled: true, maxAttempts: 99 };
    assert.throws(() => parseConfig(JSON.stringify(config)), ConfigError);
});

test('parseConfig detects legacy shell keys', () => {
    const config = baseConfig();
    config.defaultShell = '/bin/zsh';
    config.groups[0].shell = '/bin/fish';
    config.groups[0].hosts[0].shell = '/bin/bash';
    const result = parseConfig(JSON.stringify(config));
    assert.deepEqual(result.warnings, [LEGACY_SHELL_MESSAGE]);
});

test('resolveConnection applies group defaults', () => {
    const config = parse(baseConfig());
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.user, 'deploy');
    assert.equal(connection.port, 2222);
    assert.equal(connection.identityFile, '~/.ssh/dev');
    assert.equal(connection.useGroupPassword, 'yes');
    assert.equal(connection.useIdentityFile, 'yes');
    assert.equal(connection.forwardAgent, 'no');
    assert.equal(connection.connectTimeout, 10);
    assert.equal(connection.serverAliveInterval, 30);
    assert.equal(connection.serverAliveCountMax, 3);
    assert.deepEqual(connection.retry, {
        enabled: false,
        maxAttempts: 3,
        delaySeconds: 5
    });
    assert.equal(connection.terminalName, 'deploy@dev.example.com');
});

test('resolveConnection applies host overrides', () => {
    const config = parse(baseConfig());
    const host = config.groups[0].hosts[0];
    host.user = 'admin';
    host.port = 2200;
    host.identityFile = '/tmp/key';
    host.forwardAgent = 'yes';
    host.terminalName = '{name} ({user}@{host}:{port})';
    host.retry = { enabled: true, maxAttempts: 5, delaySeconds: 2 };
    const connection = resolveConnection(config.groups[0], host);
    assert.equal(connection.user, 'admin');
    assert.equal(connection.port, 2200);
    assert.equal(connection.identityFile, '/tmp/key');
    assert.equal(connection.forwardAgent, 'yes');
    assert.equal(connection.terminalName, 'Dev 1 (admin@dev.example.com:2200)');
    assert.deepEqual(connection.retry, {
        enabled: true,
        maxAttempts: 5,
        delaySeconds: 2
    });
});

test('resolveConnection falls back to root and port 22', () => {
    const config = parse({
        groups: [{ name: 'Misc', hosts: [{ name: 'Host', host: 'example.com' }] }]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.user, 'root');
    assert.equal(connection.port, 22);
    assert.equal(connection.identityFile, '');
    assert.equal(connection.terminalName, 'root@example.com');
});

test('resolveConnection accepts boolean yes/no values', () => {
    const config = parse({
        groups: [
            {
                name: 'Misc',
                hosts: [
                    {
                        name: 'Host',
                        host: 'example.com',
                        useGroupPassword: false,
                        useIdentityFile: true,
                        forwardAgent: true
                    }
                ]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.useGroupPassword, 'no');
    assert.equal(connection.useIdentityFile, 'yes');
    assert.equal(connection.forwardAgent, 'yes');
});

test('formatTerminalName replaces supported placeholders only', () => {
    assert.equal(
        formatTerminalName('{name}:{user}@{host}:{port}', {
            name: 'Dev',
            user: 'root',
            host: 'example.com',
            port: 22
        }),
        'Dev:root@example.com:22'
    );
    assert.equal(formatTerminalName('{unknown}', {}), '{unknown}');
});

test('parseConfig rejects invalid yes/no values', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].useIdentityFile = 'sometimes';
    assert.throws(() => parseConfig(JSON.stringify(config)), ConfigError);
});
