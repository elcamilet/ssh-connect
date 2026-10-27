'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSshArgs, buildTerminalInvocation } = require('../../lib/ssh');

function connection(overrides = {}) {
    return {
        host: 'example.com',
        user: 'deploy',
        port: 2222,
        identityFile: '/home/deploy/key',
        useIdentityFile: 'yes',
        forwardAgent: 'no',
        connectTimeout: 10,
        serverAliveInterval: 30,
        serverAliveCountMax: 3,
        ...overrides
    };
}

test('buildSshArgs includes port, identity and keep-alive options', () => {
    const args = buildSshArgs(connection());
    assert.deepEqual(args, [
        '-p',
        '2222',
        '-i',
        '/home/deploy/key',
        '-o',
        'ConnectTimeout=10',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ServerAliveCountMax=3',
        'deploy@example.com'
    ]);
});

test('buildSshArgs omits identity when disabled', () => {
    const args = buildSshArgs(connection({ useIdentityFile: 'no' }));
    assert.equal(args.includes('-i'), false);
});

test('buildSshArgs omits zero keep-alive values', () => {
    const args = buildSshArgs(
        connection({
            connectTimeout: 0,
            serverAliveInterval: 0,
            serverAliveCountMax: 0
        })
    );
    assert.equal(args.includes('ConnectTimeout=0'), false);
    assert.equal(args.includes('ServerAliveInterval=0'), false);
    assert.equal(args.includes('ServerAliveCountMax=0'), false);
});

test('buildSshArgs adds agent forwarding', () => {
    const args = buildSshArgs(connection({ forwardAgent: 'yes' }));
    assert.equal(args.includes('-A'), true);
});

test('buildSshArgs keeps an identity path with spaces as one argument', () => {
    const args = buildSshArgs(connection({ identityFile: '/home/deploy/my key' }));
    const index = args.indexOf('-i');
    assert.equal(args[index + 1], '/home/deploy/my key');
});

test('buildTerminalInvocation uses ssh without a password', () => {
    const invocation = buildTerminalInvocation(connection(), 'linux', {
        sshPath: '/usr/bin/ssh',
        sshpassAvailable: true
    });
    assert.equal(invocation.command, '/usr/bin/ssh');
    assert.deepEqual(invocation.args, buildSshArgs(connection()));
    assert.deepEqual(invocation.env, {});
    assert.deepEqual(invocation.warnings, []);
});

test('buildTerminalInvocation uses sshpass -e and env for a password', () => {
    const secret = "a'b";
    const invocation = buildTerminalInvocation(connection({ password: secret }), 'linux', {
        sshPath: '/usr/bin/ssh',
        sshpassAvailable: true,
        sshpassPath: '/usr/bin/sshpass'
    });
    assert.equal(invocation.command, '/usr/bin/sshpass');
    assert.deepEqual(invocation.args.slice(0, 2), ['-e', 'ssh']);
    assert.equal(invocation.env.SSHPASS, secret);
    assert.equal(invocation.args.includes(secret), false);
    assert.deepEqual(invocation.warnings, []);
});

test('buildTerminalInvocation falls back to ssh if sshpass is missing', () => {
    const invocation = buildTerminalInvocation(connection({ password: 'secret' }), 'linux', {
        sshPath: '/usr/bin/ssh',
        sshpassAvailable: false
    });
    assert.equal(invocation.command, '/usr/bin/ssh');
    assert.equal(invocation.args.includes('secret'), false);
    assert.equal(invocation.warnings.length, 1);
});

test('buildTerminalInvocation uses ssh and warns on Windows', () => {
    const invocation = buildTerminalInvocation(connection({ password: 'secret' }), 'win32', {
        sshPath: 'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
        sshpassAvailable: false
    });
    assert.equal(invocation.command, 'C:\\Windows\\System32\\OpenSSH\\ssh.exe');
    assert.equal(invocation.args.includes('secret'), false);
    assert.equal(invocation.warnings.length, 1);
});

test('buildTerminalInvocation does not warn on Windows without a password', () => {
    const invocation = buildTerminalInvocation(connection(), 'win32', {
        sshPath: 'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
        sshpassAvailable: false
    });
    assert.deepEqual(invocation.warnings, []);
});
