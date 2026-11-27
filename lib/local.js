'use strict';

function buildLocalInvocation(connection) {
    const shellArgs = Array.isArray(connection.shellArgs) ? [...connection.shellArgs] : [];
    const args = connection.startCommand
        ? [...shellArgs, connection.startCommand]
        : shellArgs;
    const logArgs = connection.startCommand
        ? [...args.slice(0, -1), '<startCommand>']
        : args;

    return {
        command: connection.shell || 'default profile',
        shellPath: connection.shell || undefined,
        shellArgs: args,
        logArgs
    };
}

module.exports = {
    buildLocalInvocation
};
