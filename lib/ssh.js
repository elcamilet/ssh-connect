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

    args.push(`${connection.user}@${connection.host}`);
    return args;
}

function buildTerminalInvocation(connection, platform, options = {}) {
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

    return { command, args, env, warnings };
}

module.exports = {
    buildSshArgs,
    buildTerminalInvocation
};
