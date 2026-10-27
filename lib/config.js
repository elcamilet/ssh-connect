'use strict';

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

const LEGACY_SHELL_MESSAGE =
    'SSH Connect 0.2.0 no longer supports custom shells. The defaultShell and shell settings are ignored.';

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

function validateHost(host, path, warnings) {
    if (!isPlainObject(host)) {
        fail(path, 'must be an object');
    }
    if (typeof host.host !== 'string' || host.host.trim().length === 0) {
        fail(`${path}.host`, 'must be a non-empty string');
    }
    if (typeof host.name !== 'string' || host.name.trim().length === 0) {
        fail(`${path}.name`, 'must be a non-empty string');
    }

    checkOptionalString(host.user, `${path}.user`);
    checkOptionalNumber(host.port, `${path}.port`, 1, 65535, true);
    checkOptionalString(host.identityFile, `${path}.identityFile`);
    checkOptionalString(host.group, `${path}.group`);
    checkOptionalString(host.terminalName, `${path}.terminalName`);
    checkOptionalNumber(host.connectTimeout, `${path}.connectTimeout`, 0, 3600);
    checkOptionalNumber(host.serverAliveInterval, `${path}.serverAliveInterval`, 0, 3600);
    checkOptionalNumber(host.serverAliveCountMax, `${path}.serverAliveCountMax`, 0, 100, true);
    checkOptionalYesNo(host.useGroupPassword, `${path}.useGroupPassword`);
    checkOptionalYesNo(host.useIdentityFile, `${path}.useIdentityFile`);
    checkOptionalYesNo(host.forwardAgent, `${path}.forwardAgent`);
    validateRetry(host.retry, `${path}.retry`);

    if (Object.prototype.hasOwnProperty.call(host, 'shell')) {
        warnings.add(LEGACY_SHELL_MESSAGE);
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
    return String(template).replace(/\{(name|user|host|port)\}/g, (match, key) => {
        const value = values[key];
        return value === undefined || value === null ? match : String(value);
    });
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
    const user = host.user || group.defaultUser || DEFAULTS.user;
    const port = host.port ?? group.defaultPort ?? DEFAULTS.port;
    const identityFile = host.identityFile || group.defaultIdentityFile || '';
    const groupName = host.group || group.name;
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
        retry: getRetryConfig(group, host)
    };
}

module.exports = {
    ConfigError,
    DEFAULTS,
    LEGACY_SHELL_MESSAGE,
    isEnabled,
    normalizeYesNo,
    parseConfig,
    formatTerminalName,
    resolveConnection
};
