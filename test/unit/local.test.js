'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLocalInvocation } = require('../../lib/local');

test('buildLocalInvocation uses the default profile without a shell', () => {
    const invocation = buildLocalInvocation({
        kind: 'local',
        shell: '',
        shellArgs: [],
        startCommand: ''
    });
    assert.equal(invocation.command, 'default profile');
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
    assert.equal(invocation.command, 'powershell.exe');
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
