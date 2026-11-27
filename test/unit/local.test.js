'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, resolveConnection } = require('../../lib/config');
const { buildLocalInvocation, canOpenLocal } = require('../../lib/local');

test('buildLocalInvocation uses the default profile without a shell', () => {
    const invocation = buildLocalInvocation({
        kind: 'local',
        shell: '',
        shellArgs: [],
        startCommand: ''
    });
    assert.equal(invocation.logCommand, 'default profile');
    assert.equal(invocation.shellPath, undefined);
    assert.deepEqual(invocation.shellArgs, []);
    assert.deepEqual(invocation.logArgs, []);
});

test('buildLocalInvocation uses an explicit shell', () => {
    const invocation = buildLocalInvocation({
        kind: 'local',
        shell: 'powershell.exe',
        shellArgs: ['-NoExit'],
        startCommand: ''
    });
    assert.equal(invocation.logCommand, 'powershell.exe');
    assert.equal(invocation.shellPath, 'powershell.exe');
    assert.deepEqual(invocation.shellArgs, ['-NoExit']);
    assert.deepEqual(invocation.logArgs, ['-NoExit']);
});

test('buildLocalInvocation appends the start command as the last argument', () => {
    const invocation = buildLocalInvocation({
        kind: 'local',
        shell: 'bash',
        shellArgs: ['-lic'],
        startCommand: 'opencode'
    });
    assert.equal(invocation.shellPath, 'bash');
    assert.deepEqual(invocation.shellArgs, ['-lic', 'opencode']);
    assert.deepEqual(invocation.logArgs, ['-lic', '<startCommand>']);
});

test('buildLocalInvocation does not mutate the configured shell arguments', () => {
    const shellArgs = ['-lic'];
    const invocation = buildLocalInvocation({
        kind: 'local',
        shell: 'bash',
        shellArgs,
        startCommand: 'opencode'
    });
    assert.deepEqual(shellArgs, ['-lic']);
    assert.notEqual(invocation.shellArgs, shellArgs);
});

test('buildLocalInvocation rejects a non-local connection', () => {
    assert.throws(
        () => buildLocalInvocation({ kind: 'ssh', shell: 'bash', shellArgs: [] }),
        /requires a local connection/
    );
});

test('buildLocalInvocation accepts a resolved local connection', () => {
    const config = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        {
                            type: 'local',
                            name: 'Bash',
                            shell: 'bash',
                            shellArgs: ['-lic'],
                            startCommand: 'opencode'
                        }
                    ]
                }
            ]
        })
    ).config;
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    const invocation = buildLocalInvocation(connection);
    assert.equal(invocation.shellPath, 'bash');
    assert.deepEqual(invocation.shellArgs, ['-lic', 'opencode']);
    assert.deepEqual(invocation.logArgs, ['-lic', '<startCommand>']);
});

test('canOpenLocal accepts a local window and rejects remote windows', () => {
    assert.equal(canOpenLocal(undefined), true);
    assert.equal(canOpenLocal(''), true);
    assert.equal(canOpenLocal('ssh-remote'), false);
    assert.equal(canOpenLocal('wsl'), false);
    assert.equal(canOpenLocal('dev-container'), false);
});
