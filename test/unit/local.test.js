'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, resolveConnection } = require('../../lib/config');
const {
    buildLocalInvocation,
    buildWslRemoteInvocation,
    canOpenLocal,
    currentWslDistro,
    isWslRemote,
    wslRemoteWarnings
} = require('../../lib/local');

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

function wslConnection(overrides = {}) {
    return {
        kind: 'wsl',
        name: 'WSL',
        distribution: '',
        user: '',
        startingDirectory: '',
        startCommand: '',
        terminalName: 'WSL',
        groupName: 'Local',
        ...overrides
    };
}

test('isWslRemote identifies a Remote-WSL window', () => {
    assert.equal(isWslRemote('wsl'), true);
    assert.equal(isWslRemote(undefined), false);
    assert.equal(isWslRemote('ssh-remote'), false);
    assert.equal(isWslRemote('dev-container'), false);
});

test('currentWslDistro reads WSL_DISTRO_NAME', () => {
    assert.equal(
        currentWslDistro({ WSL_DISTRO_NAME: 'Ubuntu-22.04' }),
        'Ubuntu-22.04'
    );
    assert.equal(currentWslDistro({}), '');
    assert.equal(currentWslDistro({ WSL_DISTRO_NAME: 42 }), '');
});

test('buildWslRemoteInvocation uses the default profile without a start command', () => {
    const invocation = buildWslRemoteInvocation(wslConnection());
    assert.equal(invocation.logCommand, 'default profile');
    assert.equal(invocation.shellPath, undefined);
    assert.deepEqual(invocation.shellArgs, []);
    assert.deepEqual(invocation.logArgs, []);
});

test('buildWslRemoteInvocation runs a start command with bash -lic', () => {
    const invocation = buildWslRemoteInvocation(
        wslConnection({ startCommand: 'opencode' })
    );
    assert.equal(invocation.logCommand, 'bash');
    assert.equal(invocation.shellPath, 'bash');
    assert.deepEqual(invocation.shellArgs, ['-lic', 'opencode']);
    assert.deepEqual(invocation.logArgs, ['-lic', '<startCommand>']);
});

test('buildWslRemoteInvocation rejects a non-WSL connection', () => {
    assert.throws(
        () => buildWslRemoteInvocation({ kind: 'local' }),
        /requires a WSL connection/
    );
});

test('wslRemoteWarnings reports distro and user mismatches', () => {
    const warnings = wslRemoteWarnings(
        wslConnection({ distribution: 'Ubuntu-24.04', user: 'other' }),
        'Ubuntu-22.04',
        'current'
    );
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /Ubuntu-22\.04/);
    assert.match(warnings[0], /Ubuntu-24\.04/);
    assert.match(warnings[1], /current/);
    assert.match(warnings[1], /other/);

    assert.deepEqual(
        wslRemoteWarnings(
            wslConnection({ distribution: 'Ubuntu-22.04', user: 'current' }),
            'Ubuntu-22.04',
            'current'
        ),
        []
    );
    assert.deepEqual(
        wslRemoteWarnings(wslConnection(), '', ''),
        []
    );
});
