'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ConfigError,
    LEGACY_SHELL_MESSAGE,
    createDefaultConfig,
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
    const result = parseConfig(JSON.stringify(config));
    assert.deepEqual(result.warnings, [LEGACY_SHELL_MESSAGE]);
});

test('parseConfig does not treat a local shell as legacy', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [{ type: 'local', name: 'Bash', shell: 'bash' }]
                }
            ]
        })
    );
    assert.equal(result.warnings.includes(LEGACY_SHELL_MESSAGE), false);
});

test('parseConfig warns when an SSH host uses a local shell', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].shell = '/bin/bash';
    const result = parseConfig(JSON.stringify(config));
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('do not apply to SSH hosts')
        )
    );
    assert.equal(result.warnings.includes(LEGACY_SHELL_MESSAGE), false);
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

test('parseConfig accepts a WSL host without host', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                hosts: [{ type: 'wsl', name: 'WSL' }]
            }
        ]
    });
    assert.equal(config.groups[0].hosts[0].type, 'wsl');
});

test('parseConfig rejects an unknown host type', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].type = 'container';
    assert.throws(() => parseConfig(JSON.stringify(config)), ConfigError);
});

test('parseConfig rejects non-string WSL and start command fields', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].startCommand = ['opencode'];
    assert.throws(() => parseConfig(JSON.stringify(config)), ConfigError);

    const wslConfig = {
        groups: [
            {
                name: 'Local',
                hosts: [{ type: 'wsl', name: 'WSL', startingDirectory: 42 }]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(wslConfig)), ConfigError);
});

test('parseConfig warns about fields that do not apply to WSL', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        {
                            type: 'wsl',
                            name: 'WSL',
                            host: 'ignored',
                            port: 22,
                            startingDirectory: '/home/dev'
                        }
                    ]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) => warning.includes('do not apply to WSL hosts'))
    );
});

test('parseConfig warns about WSL-only fields on an SSH host', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].startingDirectory = '/tmp';
    const result = parseConfig(JSON.stringify(config));
    assert.ok(
        result.warnings.some((warning) => warning.includes('do not apply to SSH hosts'))
    );
});

test('parseConfig warns about a group-level startCommand', () => {
    const config = baseConfig();
    config.groups[0].startCommand = 'opencode';
    const result = parseConfig(JSON.stringify(config));
    assert.ok(result.warnings.some((warning) => warning.includes('host entries')));
});

test('resolveConnection returns a WSL connection with defaults', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                defaultUser: 'ssh-user',
                defaultPort: 2222,
                hosts: [{ type: 'wsl', name: 'WSL' }]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.deepEqual(connection, {
        kind: 'wsl',
        name: 'WSL',
        distribution: '',
        user: '',
        startingDirectory: '',
        startCommand: '',
        terminalName: 'WSL',
        groupName: 'Local'
    });
});

test('resolveConnection builds a WSL connection with explicit fields', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'wsl',
                        name: 'Ubuntu',
                        distribution: 'Ubuntu-22.04',
                        user: 'camilo',
                        startingDirectory: '/home/camilo/app',
                        startCommand: 'opencode'
                    }
                ]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.deepEqual(connection, {
        kind: 'wsl',
        name: 'Ubuntu',
        distribution: 'Ubuntu-22.04',
        user: 'camilo',
        startingDirectory: '/home/camilo/app',
        startCommand: 'opencode',
        terminalName: 'Ubuntu',
        groupName: 'Local'
    });
});

test('resolveConnection ignores group terminalName for WSL', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                terminalName: '{user}@{host}',
                hosts: [{ type: 'wsl', name: 'WSL' }]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.terminalName, 'WSL');
});

test('resolveConnection expands {distribution} for WSL', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'wsl',
                        name: 'Ubuntu',
                        distribution: 'Ubuntu-22.04',
                        terminalName: '{name} ({distribution})'
                    }
                ]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.terminalName, 'Ubuntu (Ubuntu-22.04)');
});

test('resolveConnection keeps startCommand for SSH', () => {
    const config = baseConfig();
    config.groups[0].hosts[0].startCommand = 'cd /srv/app && exec bash -l';
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.equal(connection.kind, 'ssh');
    assert.equal(connection.startCommand, 'cd /srv/app && exec bash -l');
});

test('parseConfig accepts a local host without host', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                hosts: [{ type: 'local', name: 'Local terminal' }]
            }
        ]
    });
    assert.equal(config.groups[0].hosts[0].type, 'local');
});

test('parseConfig rejects local startCommand without shell', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'local',
                        name: 'Local terminal',
                        shellArgs: ['-lic'],
                        startCommand: 'opencode'
                    }
                ]
            }
        ]
    };
    assert.throws(
        () => parseConfig(JSON.stringify(config)),
        /shell and a non-empty shellArgs/
    );
});

test('parseConfig rejects local startCommand without shellArgs', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'local',
                        name: 'Local terminal',
                        shell: 'bash',
                        startCommand: 'opencode'
                    }
                ]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(config)), /shellArgs/);
});

test('parseConfig rejects shellArgs without shell', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [{ type: 'local', name: 'Local terminal', shellArgs: ['-lic'] }]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(config)), /shell/);
});

test('parseConfig rejects non-string shellArgs items', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [{ type: 'local', name: 'Local terminal', shell: 'bash', shellArgs: [1] }]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(config)), /shellArgs/);
});

test('parseConfig rejects a relative startingDirectory for a local host', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'local',
                        name: 'Local terminal',
                        startingDirectory: 'relative/path'
                    }
                ]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(config)), /absolute path/);
});

test('parseConfig rejects empty shellArgs values with a startCommand', () => {
    const config = {
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'local',
                        name: 'Local terminal',
                        shell: 'bash',
                        shellArgs: [''],
                        startCommand: 'opencode'
                    }
                ]
            }
        ]
    };
    assert.throws(() => parseConfig(JSON.stringify(config)), /empty strings/);
});

test('parseConfig warns about fields that do not apply to local hosts', () => {
    const ignored = {
        host: 'ignored',
        port: 22,
        identityFile: '/tmp/key',
        user: 'dev',
        group: 'ops',
        useGroupPassword: 'no',
        useIdentityFile: 'no',
        forwardAgent: 'no',
        connectTimeout: 10,
        serverAliveInterval: 30,
        serverAliveCountMax: 3,
        retry: { enabled: false },
        distribution: 'Ubuntu'
    };
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [{ type: 'local', name: 'Local terminal', ...ignored }]
                }
            ]
        })
    );
    const warning = result.warnings.find((item) =>
        item.includes('do not apply to Local hosts')
    );
    assert.ok(warning);
    for (const key of Object.keys(ignored)) {
        assert.match(warning, new RegExp(`\\b${key}\\b`));
    }
});

test('parseConfig ignores invalid values in local fields that do not apply', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        {
                            type: 'local',
                            name: 'Local terminal',
                            port: 'abc',
                            user: 42,
                            identityFile: 42,
                            group: 42,
                            useGroupPassword: 'sometimes',
                            retry: { maxAttempts: 99 }
                        }
                    ]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('do not apply to Local hosts')
        )
    );
});

test('parseConfig ignores invalid shell fields on SSH hosts', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Dev',
                    hosts: [
                        {
                            name: 'Dev 1',
                            host: 'dev.example.com',
                            shell: 123,
                            shellArgs: '-l',
                            startingDirectory: 42,
                            distribution: 42
                        }
                    ]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('do not apply to SSH hosts')
        )
    );
});

test('parseConfig ignores invalid shell fields on WSL hosts', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        { type: 'wsl', name: 'WSL', shell: 123, shellArgs: '-l' }
                    ]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('do not apply to WSL hosts')
        )
    );
});

test('parseConfig treats null and empty shellArgs as absent without a shell', () => {
    for (const shellArgs of [null, []]) {
        const config = {
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        {
                            type: 'local',
                            name: 'Local terminal',
                            shellArgs
                        }
                    ]
                }
            ]
        };
        assert.doesNotThrow(() => parseConfig(JSON.stringify(config)));
    }
});

test('parseConfig warns when the last shellArgs is not a command flag', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [
                        {
                            type: 'local',
                            name: 'Bash',
                            shell: 'bash',
                            shellArgs: ['-l'],
                            startCommand: 'opencode'
                        }
                    ]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) =>
            warning.includes('shellArgs ending in "-l"')
        )
    );
});

test('parseConfig keeps the WSL group name without a warning', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [{ type: 'wsl', name: 'WSL', group: 'ops' }]
                }
            ]
        })
    );
    assert.deepEqual(result.warnings, []);
    const connection = resolveConnection(
        result.config.groups[0],
        result.config.groups[0].hosts[0]
    );
    assert.equal(connection.groupName, 'ops');
});

test('resolveConnection ignores host.group for local entries', () => {
    const result = parseConfig(
        JSON.stringify({
            groups: [
                {
                    name: 'Local',
                    hosts: [{ type: 'local', name: 'Local terminal', group: 'ops' }]
                }
            ]
        })
    );
    assert.ok(
        result.warnings.some((warning) => warning.includes('group'))
    );
    const connection = resolveConnection(
        result.config.groups[0],
        result.config.groups[0].hosts[0]
    );
    assert.equal(connection.groupName, 'Local');
});

test('resolveConnection returns a local connection with defaults', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                defaultUser: 'ssh-user',
                defaultPort: 2222,
                hosts: [{ type: 'local', name: 'Local terminal' }]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.deepEqual(connection, {
        kind: 'local',
        name: 'Local terminal',
        startingDirectory: '',
        shell: '',
        shellArgs: [],
        startCommand: '',
        terminalName: 'Local terminal',
        groupName: 'Local'
    });
});

test('resolveConnection builds a local connection with explicit fields', () => {
    const config = parse({
        groups: [
            {
                name: 'Local',
                hosts: [
                    {
                        type: 'local',
                        name: 'Bash',
                        startingDirectory: '/home/dev',
                        shell: 'bash',
                        shellArgs: ['-lic'],
                        startCommand: 'opencode'
                    }
                ]
            }
        ]
    });
    const connection = resolveConnection(config.groups[0], config.groups[0].hosts[0]);
    assert.deepEqual(connection, {
        kind: 'local',
        name: 'Bash',
        startingDirectory: '/home/dev',
        shell: 'bash',
        shellArgs: ['-lic'],
        startCommand: 'opencode',
        terminalName: 'Bash',
        groupName: 'Local'
    });
});

test('formatTerminalName supports the distribution placeholder', () => {
    assert.equal(
        formatTerminalName('{name} ({distribution})', {
            name: 'Ubuntu',
            distribution: 'Ubuntu-22.04'
        }),
        'Ubuntu (Ubuntu-22.04)'
    );
});

test('createDefaultConfig adds a local example and a Windows WSL example', () => {
    const windows = createDefaultConfig('win32');
    assert.equal(windows.groups[0].name, 'Local');
    assert.deepEqual(
        windows.groups[0].hosts.map((host) => host.type),
        ['local', 'wsl']
    );
    assert.deepEqual(
        windows.groups[0].hosts.map((host) => host.name),
        ['Local terminal', 'WSL']
    );
    assert.deepEqual(parseConfig(JSON.stringify(windows)).warnings, []);

    const linux = createDefaultConfig('linux');
    assert.equal(linux.groups[0].name, 'Local');
    assert.deepEqual(
        linux.groups[0].hosts.map((host) => host.type),
        ['local']
    );
    assert.deepEqual(
        linux.groups[0].hosts.map((host) => host.name),
        ['Local terminal']
    );
    assert.deepEqual(parseConfig(JSON.stringify(linux)).warnings, []);
});

test('createDefaultConfig omits the Local group in a remote window', () => {
    const remote = createDefaultConfig('linux', { isRemote: true });
    assert.equal(
        remote.groups.some((group) => group.name === 'Local'),
        false
    );
    assert.deepEqual(parseConfig(JSON.stringify(remote)).warnings, []);

    const remoteWindows = createDefaultConfig('win32', { isRemote: 'ssh-remote' });
    assert.equal(
        remoteWindows.groups.some((group) => group.name === 'Local'),
        false
    );
});
