'use strict';

function canOpenLocal(remoteName) {
    return !remoteName;
}

function isWslRemote(remoteName) {
    return remoteName === 'wsl';
}

function currentWslDistro(remoteAuthority) {
    if (typeof remoteAuthority !== 'string' || !remoteAuthority.startsWith('wsl+')) {
        return '';
    }
    const encoded = remoteAuthority.slice(4);
    try {
        return decodeURIComponent(encoded);
    } catch {
        return encoded;
    }
}

function wslRemoteWarnings(connection, currentDistro, currentUser) {
    const warnings = [];
    if (
        connection.distribution &&
        currentDistro &&
        connection.distribution !== currentDistro
    ) {
        warnings.push(
            `The Remote-WSL window is connected to "${currentDistro}", but the entry asks for "${connection.distribution}". Opening the current distro.`
        );
    }
    if (connection.user && currentUser && connection.user !== currentUser) {
        warnings.push(
            `The Remote-WSL window runs as "${currentUser}", but the entry asks for "${connection.user}". Opening the current user.`
        );
    }
    return warnings;
}

function buildWslRemoteInvocation(connection) {
    if (connection.kind !== 'wsl') {
        throw new Error('buildWslRemoteInvocation requires a WSL connection');
    }
    return buildLocalInvocation({
        kind: 'local',
        shell: connection.startCommand ? 'bash' : '',
        shellArgs: connection.startCommand ? ['-lic'] : [],
        startCommand: connection.startCommand
    });
}

function buildLocalInvocation(connection) {
    if (connection.kind !== 'local') {
        throw new Error('buildLocalInvocation requires a local connection');
    }

    const shellArgs = Array.isArray(connection.shellArgs) ? [...connection.shellArgs] : [];
    const args = connection.startCommand
        ? [...shellArgs, connection.startCommand]
        : shellArgs;
    const logArgs = connection.startCommand
        ? [...args.slice(0, -1), '<startCommand>']
        : args;

    return {
        logCommand: connection.shell || 'default profile',
        shellPath: connection.shell || undefined,
        shellArgs: args,
        logArgs
    };
}

module.exports = {
    buildLocalInvocation,
    buildWslRemoteInvocation,
    canOpenLocal,
    currentWslDistro,
    isWslRemote,
    wslRemoteWarnings
};
