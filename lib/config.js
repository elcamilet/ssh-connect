'use strict';

const nodePath = require('path');

class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}

const DEFAULTS = {
    user: 'root',
    port: 22,
    useGroupPassword: 'yes',
    useIdentityFile: 'yes',
    forwardAgent: 'no',
    connectTimeout: 10,
    serverAliveInterval: 30,
    serverAliveCountMax: 3,
    retry: {
        enabled: false,
        maxAttempts: 3,
        delaySeconds: 5
    }
};

const COMMAND_FLAGS = ['-c', '-lc', '-lic', '-ic', '-command', '/k', '/c'];

const LEGACY_SHELL_MESSAGE =
    'SSH Connect 0.2.0 no longer supports custom shells for SSH hosts. The defaultShell, root-level shell and group.shell settings are ignored.';

function fail(path, message) {
    throw new ConfigError(`${path}: ${message}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeYesNo(value, defaultValue, path = 'value') {
    if (value === undefined || value === null) {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value ? 'yes' : 'no';
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'yes' || normalized === 'no') {
            return normalized;
        }
    }
    fail(path, 'expected "yes" or "no"');
}

function isEnabled(value, defaultValue = false) {
    return normalizeYesNo(value, defaultValue ? 'yes' : 'no', 'value') === 'yes';
}

function checkOptionalString(value, path) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
        fail(path, 'must be a string');
    }
}

function checkOptionalStringArray(value, path) {
    if (value === undefined || value === null) {
        return;
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        fail(path, 'must be an array of strings');
    }
}

function checkOptionalNumber(value, path, min, max, integer = false) {
    if (value === undefined || value === null) {
        return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail(path, `must be a number between ${min} and ${max}`);
    }
    if (integer && !Number.isInteger(value)) {
        fail(path, 'must be an integer');
    }
}

function checkOptionalYesNo(value, path) {
    if (value !== undefined && value !== null) {
        normalizeYesNo(value, 'no', path);
    }
}

function validateRetry(retry, path) {
    if (retry === undefined || retry === null) {
        return;
    }
    if (!isPlainObject(retry)) {
        fail(path, 'must be an object');
    }
    if (retry.enabled !== undefined && typeof retry.enabled !== 'boolean') {
        fail(`${path}.enabled`, 'must be a boolean');
    }
    checkOptionalNumber(retry.maxAttempts, `${path}.maxAttempts`, 1, 10, true);
    checkOptionalNumber(retry.delaySeconds, `${path}.delaySeconds`, 1, 300, true);
}

function validateSshHost(host, path) {
    if (typeof host.host !== 'string' || host.host.trim().length === 0) {
        fail(`${path}.host`, 'must be a non-empty string for SSH hosts');
    }
    checkOptionalString(host.user, `${path}.user`);
    checkOptionalNumber(host.port, `${path}.port`, 1, 65535, true);
    checkOptionalString(host.identityFile, `${path}.identityFile`);
    checkOptionalString(host.group, `${path}.group`);
    checkOptionalNumber(host.connectTimeout, `${path}.connectTimeout`, 0, 3600);
    checkOptionalNumber(host.serverAliveInterval, `${path}.serverAliveInterval`, 0, 3600);
    checkOptionalNumber(host.serverAliveCountMax, `${path}.serverAliveCountMax`, 0, 100, true);
    checkOptionalYesNo(host.useGroupPassword, `${path}.useGroupPassword`);
    checkOptionalYesNo(host.useIdentityFile, `${path}.useIdentityFile`);
    checkOptionalYesNo(host.forwardAgent, `${path}.forwardAgent`);
    validateRetry(host.retry, `${path}.retry`);
}

function validateWslHost(host, path) {
    checkOptionalString(host.user, `${path}.user`);
    checkOptionalString(host.group, `${path}.group`);
    checkOptionalString(host.distribution, `${path}.distribution`);
    checkOptionalString(host.startingDirectory, `${path}.startingDirectory`);
}

function validateLocalHost(host, path, warnings) {
    checkOptionalString(host.startingDirectory, `${path}.startingDirectory`);
    checkOptionalString(host.shell, `${path}.shell`);
    checkOptionalStringArray(host.shellArgs, `${path}.shellArgs`);

    const startingDirectory =
        typeof host.startingDirectory === 'string' ? host.startingDirectory.trim() : '';
    if (startingDirectory && !nodePath.isAbsolute(startingDirectory)) {
        fail(`${path}.startingDirectory`, 'must be an absolute path for local hosts');
    }

    const hasStartCommand =
        typeof host.startCommand === 'string' && host.startCommand.trim().length > 0;
    const hasShell = typeof host.shell === 'string' && host.shell.trim().length > 0;
    const hasShellArgs = Array.isArray(host.shellArgs) && host.shellArgs.length > 0;
    if (hasStartCommand && !hasShell) {
        fail(
            `${path}.shell`,
            'shell and a non-empty shellArgs are required when startCommand is set for local hosts'
        );
    }
    if (hasStartCommand && !hasShellArgs) {
        fail(
            `${path}.shellArgs`,
            'shell and a non-empty shellArgs are required when startCommand is set for local hosts'
        );
    }
    if (hasShellArgs && !hasShell) {
        fail(`${path}.shell`, 'is required when shellArgs is set');
    }

    if (!Array.isArray(host.shellArgs) || host.shellArgs.length === 0) {
        return;
    }

    const commandFlag = host.shellArgs[host.shellArgs.length - 1];
    const isCommandFlag = COMMAND_FLAGS.includes(commandFlag.toLowerCase());
    if (!hasStartCommand) {
        if (isCommandFlag) {
            warnings.add(
                `Local host "${host.name}" ends shellArgs with "${commandFlag}" but has no startCommand. ` +
                    'The shell may wait for a command.'
            );
        }
        return;
    }

    if (host.shellArgs.some((argument) => argument.length === 0)) {
        fail(
            `${path}.shellArgs`,
            'must not contain empty strings when startCommand is set for local hosts'
        );
    }
    if (!isCommandFlag) {
        warnings.add(
            `Local host "${host.name}" uses shellArgs ending in "${commandFlag}". ` +
                'If that is not the shell flag that runs startCommand, the command can be ' +
                'read as a script file. Use -c, -lic, -Command, /K or /C.'
        );
    }
}

function validateHost(host, path, warnings) {
    if (!isPlainObject(host)) {
        fail(path, 'must be an object');
    }
    if (typeof host.name !== 'string' || host.name.trim().length === 0) {
        fail(`${path}.name`, 'must be a non-empty string');
    }
    if (
        host.type !== undefined &&
        host.type !== 'ssh' &&
        host.type !== 'wsl' &&
        host.type !== 'local'
    ) {
        fail(`${path}.type`, 'must be "ssh", "wsl" or "local"');
    }

    const type = host.type || 'ssh';
    checkOptionalString(host.terminalName, `${path}.terminalName`);
    checkOptionalString(host.startCommand, `${path}.startCommand`);

    if (type === 'ssh') {
        validateSshHost(host, path);
    } else if (type === 'wsl') {
        validateWslHost(host, path);
    } else {
        validateLocalHost(host, path, warnings);
    }

    const ignoredByType = {
        ssh: ['distribution', 'startingDirectory', 'shell', 'shellArgs'],
        wsl: [
            'host',
            'port',
            'identityFile',
            'useGroupPassword',
            'useIdentityFile',
            'forwardAgent',
            'connectTimeout',
            'serverAliveInterval',
            'serverAliveCountMax',
            'retry',
            'shell',
            'shellArgs'
        ],
        local: [
            'host',
            'port',
            'identityFile',
            'user',
            'group',
            'useGroupPassword',
            'useIdentityFile',
            'forwardAgent',
            'connectTimeout',
            'serverAliveInterval',
            'serverAliveCountMax',
            'retry',
            'distribution'
        ]
    };
    const ignored = ignoredByType[type].filter((key) =>
        Object.prototype.hasOwnProperty.call(host, key)
    );
    if (ignored.length > 0) {
        const label = type === 'ssh' ? 'SSH' : type === 'wsl' ? 'WSL' : 'Local';
        warnings.add(
            `${label} host "${host.name}" ignores settings that do not apply to ${label} hosts: ${ignored.join(', ')}.`
        );
    }
}

function validateGroup(group, path, warnings) {
    if (!isPlainObject(group)) {
        fail(path, 'must be an object');
    }
    if (typeof group.name !== 'string' || group.name.trim().length === 0) {
        fail(`${path}.name`, 'must be a non-empty string');
    }
    if (!Array.isArray(group.hosts)) {
        fail(`${path}.hosts`, 'must be an array');
    }

    checkOptionalString(group.defaultUser, `${path}.defaultUser`);
    checkOptionalNumber(group.defaultPort, `${path}.defaultPort`, 1, 65535, true);
    checkOptionalString(group.defaultIdentityFile, `${path}.defaultIdentityFile`);
    checkOptionalString(group.terminalName, `${path}.terminalName`);
    checkOptionalNumber(group.connectTimeout, `${path}.connectTimeout`, 0, 3600);
    checkOptionalNumber(group.serverAliveInterval, `${path}.serverAliveInterval`, 0, 3600);
    checkOptionalNumber(group.serverAliveCountMax, `${path}.serverAliveCountMax`, 0, 100, true);
    checkOptionalYesNo(group.forwardAgent, `${path}.forwardAgent`);
    validateRetry(group.retry, `${path}.retry`);

    if (
        Object.prototype.hasOwnProperty.call(group, 'shell') ||
        Object.prototype.hasOwnProperty.call(group, 'defaultShell')
    ) {
        warnings.add(LEGACY_SHELL_MESSAGE);
    }

    if (Object.prototype.hasOwnProperty.call(group, 'startCommand')) {
        warnings.add(
            'startCommand is only supported on host entries. The group-level startCommand is ignored.'
        );
    }

    group.hosts.forEach((host, index) => {
        validateHost(host, `${path}.hosts[${index}]`, warnings);
    });
}

function parseConfig(text) {
    let config;
    try {
        config = JSON.parse(text);
    } catch (error) {
        throw new ConfigError(`Invalid JSON: ${error.message}`);
    }

    if (!isPlainObject(config)) {
        throw new ConfigError('The configuration root must be an object.');
    }
    if (!Array.isArray(config.groups)) {
        throw new ConfigError('groups: must be an array.');
    }

    const warnings = new Set();
    if (
        Object.prototype.hasOwnProperty.call(config, 'defaultShell') ||
        Object.prototype.hasOwnProperty.call(config, 'shell')
    ) {
        warnings.add(LEGACY_SHELL_MESSAGE);
    }

    config.groups.forEach((group, index) => {
        validateGroup(group, `groups[${index}]`, warnings);
    });

    return {
        config,
        warnings: Array.from(warnings)
    };
}

function formatTerminalName(template, values) {
    return String(template).replace(/\{(name|user|host|port|distribution)\}/g, (match, key) => {
        const value = values[key];
        return value === undefined || value === null ? match : String(value);
    });
}

function normalizeStartCommand(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : '';
}

function getRetryConfig(group, host) {
    const groupRetry = group.retry || {};
    const hostRetry = host.retry || {};
    return {
        enabled: hostRetry.enabled ?? groupRetry.enabled ?? DEFAULTS.retry.enabled,
        maxAttempts: hostRetry.maxAttempts ?? groupRetry.maxAttempts ?? DEFAULTS.retry.maxAttempts,
        delaySeconds: hostRetry.delaySeconds ?? groupRetry.delaySeconds ?? DEFAULTS.retry.delaySeconds
    };
}

function resolveConnection(group, host) {
    const groupName =
        host.type === 'local' ? group.name : host.group || group.name;
    const startCommand = normalizeStartCommand(host.startCommand);

    if (host.type === 'local') {
        const startingDirectory =
            typeof host.startingDirectory === 'string' ? host.startingDirectory.trim() : '';
        const shell = typeof host.shell === 'string' ? host.shell.trim() : '';
        const shellArgs = Array.isArray(host.shellArgs) ? host.shellArgs.slice() : [];
        const terminalName = formatTerminalName(host.terminalName || '{name}', {
            name: host.name
        });

        return {
            kind: 'local',
            name: host.name,
            startingDirectory,
            shell,
            shellArgs,
            startCommand,
            terminalName,
            groupName
        };
    }

    if (host.type === 'wsl') {
        const distribution = typeof host.distribution === 'string' ? host.distribution.trim() : '';
        const user = typeof host.user === 'string' ? host.user.trim() : '';
        const startingDirectory =
            typeof host.startingDirectory === 'string' ? host.startingDirectory.trim() : '';
        const terminalName = formatTerminalName(host.terminalName || '{name}', {
            name: host.name,
            user: user || undefined,
            distribution: distribution || 'default'
        });

        return {
            kind: 'wsl',
            name: host.name,
            distribution,
            user,
            startingDirectory,
            startCommand,
            terminalName,
            groupName
        };
    }

    const user = host.user || group.defaultUser || DEFAULTS.user;
    const port = host.port ?? group.defaultPort ?? DEFAULTS.port;
    const identityFile = host.identityFile || group.defaultIdentityFile || '';
    const useGroupPassword = normalizeYesNo(
        host.useGroupPassword,
        DEFAULTS.useGroupPassword,
        'useGroupPassword'
    );
    const useIdentityFile = normalizeYesNo(
        host.useIdentityFile,
        DEFAULTS.useIdentityFile,
        'useIdentityFile'
    );
    const forwardAgent = normalizeYesNo(
        host.forwardAgent ?? group.forwardAgent,
        DEFAULTS.forwardAgent,
        'forwardAgent'
    );
    const terminalNameTemplate = host.terminalName || group.terminalName || '{user}@{host}';
    const terminalName = formatTerminalName(terminalNameTemplate, {
        name: host.name,
        user,
        host: host.host,
        port
    });

    return {
        kind: 'ssh',
        name: host.name,
        host: host.host,
        user,
        port,
        identityFile,
        groupName,
        useGroupPassword,
        useIdentityFile,
        forwardAgent,
        terminalName,
        connectTimeout: host.connectTimeout ?? group.connectTimeout ?? DEFAULTS.connectTimeout,
        serverAliveInterval:
            host.serverAliveInterval ?? group.serverAliveInterval ?? DEFAULTS.serverAliveInterval,
        serverAliveCountMax:
            host.serverAliveCountMax ?? group.serverAliveCountMax ?? DEFAULTS.serverAliveCountMax,
        startCommand,
        retry: getRetryConfig(group, host)
    };
}

function createDefaultConfig(platform = process.platform, options = {}) {
    const isRemote = Boolean(options.isRemote);
    const groups = [
        {
            name: 'Development',
            defaultUser: 'root',
            defaultPort: 22,
            defaultIdentityFile: '',
            forwardAgent: 'no',
            connectTimeout: 10,
            serverAliveInterval: 30,
            serverAliveCountMax: 3,
            retry: {
                enabled: false,
                maxAttempts: 3,
                delaySeconds: 5
            },
            hosts: [
                {
                    host: 'dev1.example.com',
                    name: 'Development Server 1',
                    user: 'devuser',
                    port: 2222,
                    identityFile: '~/.ssh/dev-cert.pem'
                },
                {
                    host: '10.10.0.1',
                    name: 'Development Server 2'
                },
                {
                    host: '10.10.0.2',
                    name: 'Development Server 3',
                    user: 'devuser2',
                    port: 222,
                    identityFile: '/tmp/cert.pem',
                    useGroupPassword: 'no',
                    useIdentityFile: 'yes'
                }
            ]
        },
        {
            name: 'Production',
            defaultUser: 'ec2-user',
            defaultPort: 22,
            defaultIdentityFile: '/path/to/prod-cert.pem',
            forwardAgent: 'no',
            hosts: [
                {
                    host: 'example.com',
                    name: 'Production Server 1',
                    user: 'admin',
                    port: 22,
                    identityFile: '~/.ssh/prod-cert.pem'
                }
            ]
        }
    ];

    if (!isRemote) {
        const localHosts = [{ type: 'local', name: 'Local terminal' }];
        if (platform === 'win32') {
            localHosts.push({ type: 'wsl', name: 'WSL' });
        }
        groups.unshift({
            name: 'Local',
            hosts: localHosts
        });
    }

    return { groups };
}

module.exports = {
    ConfigError,
    DEFAULTS,
    LEGACY_SHELL_MESSAGE,
    createDefaultConfig,
    isEnabled,
    normalizeYesNo,
    parseConfig,
    formatTerminalName,
    resolveConnection
};
