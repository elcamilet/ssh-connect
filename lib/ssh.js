'use strict';

const { isEnabled } = require('./config');

function buildSshArgs(connection) {
    const args = ['-p', String(connection.port)];

    if (isEnabled(connection.useIdentityFile, true) && connection.identityFile) {
        args.push('-i', connection.identityFile);
    }
    if (isEnabled(connection.forwardAgent, false)) {
        args.push('-A');
    }
    if (connection.connectTimeout > 0) {
        args.push('-o', `ConnectTimeout=${connection.connectTimeout}`);
    }
    if (connection.serverAliveInterval > 0) {
        args.push('-o', `ServerAliveInterval=${connection.serverAliveInterval}`);
    }
    if (connection.serverAliveCountMax > 0) {
        args.push('-o', `ServerAliveCountMax=${connection.serverAliveCountMax}`);
    }
    if (connection.startCommand) {
        args.push('-t');
    }

    args.push(`${connection.user}@${connection.host}`);
    if (connection.startCommand) {
        args.push(connection.startCommand);
    }

    return args;
}

function buildWslArgs(connection) {
    const args = [];

    if (connection.distribution) {
        args.push('--distribution', connection.distribution);
    }
    if (connection.user) {
        args.push('--user', connection.user);
    }
    if (connection.startingDirectory) {
        args.push('--cd', connection.startingDirectory);
    }
    if (connection.startCommand) {
        args.push('--exec', 'bash', '-lic', connection.startCommand);
    }

    return args;
}

function redactStartCommand(args, startCommand) {
    if (!startCommand) {
        return args;
    }

    const logArgs = [...args];
    const index = logArgs.lastIndexOf(startCommand);
    if (index !== -1) {
        logArgs[index] = '<startCommand>';
    }
    return logArgs;
}

function buildTerminalInvocation(connection, platform, options = {}) {
    if (
        connection.kind !== undefined &&
        connection.kind !== 'ssh' &&
        connection.kind !== 'wsl'
    ) {
        throw new Error(`Unsupported connection kind: ${connection.kind}`);
    }

    if (connection.kind === 'wsl') {
        const args = buildWslArgs(connection);
        return {
            command: options.wslPath || 'wsl.exe',
            args,
            env: {},
            warnings: [],
            logArgs: redactStartCommand(args, connection.startCommand)
        };
    }

    const sshArgs = buildSshArgs(connection);
    const warnings = [];
    const hasPassword =
        typeof connection.password === 'string' && connection.password.length > 0;

    let command = options.sshPath || 'ssh';
    let args = sshArgs;
    let env = {};

    if (hasPassword) {
        if (platform === 'win32') {
            warnings.push(
                'Stored passwords are not supported on Windows. Use an SSH key/agent or enter the password in the terminal.'
            );
        } else if (!options.sshpassAvailable) {
            warnings.push(
                'sshpass is not installed. Enter the password in the terminal or install sshpass.'
            );
        } else {
            command = options.sshpassPath || 'sshpass';
            args = ['-e', 'ssh', ...sshArgs];
            env = { SSHPASS: connection.password };
        }
    }

    return {
        command,
        args,
        env,
        warnings,
        logArgs: redactStartCommand(args, connection.startCommand)
    };
}

module.exports = {
    buildSshArgs,
    buildWslArgs,
    buildTerminalInvocation
};
