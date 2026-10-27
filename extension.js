'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseConfig, resolveConnection } = require('./lib/config');
const { buildTerminalInvocation } = require('./lib/ssh');
const { PasswordStore } = require('./lib/passwords');
const { shouldRetry, retryDelayMs } = require('./lib/retry');

const activeTerminals = new Map();
const retryTimers = new Set();

function getFixedSSHConfigPath(context) {
    const configPath = path.join(context.globalStorageUri.fsPath, 'ssh-config.json');
    if (!fs.existsSync(configPath)) {
        const template = {
            groups: [
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
            ]
        };
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
    }
    return configPath;
}

function commandExists(command) {
    try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        execFileSync(locator, [command], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function findExecutable(command) {
    try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const output = execFileSync(locator, [command], { encoding: 'utf8' }).trim();
        return output.split(/\r?\n/)[0] || command;
    } catch {
        return command;
    }
}

function resolveSshPath() {
    if (process.platform === 'win32') {
        const systemRoot = process.env.SystemRoot || process.env.WINDIR;
        if (systemRoot) {
            const candidate = path.join(systemRoot, 'System32', 'OpenSSH', 'ssh.exe');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return findExecutable('ssh');
}

class SSHHostsProvider {
    constructor(configPath, options = {}) {
        this.configPath = configPath;
        this.onError = options.onError || (() => {});
        this.onLegacyShell = options.onLegacyShell || (() => {});
        this.groups = [];
        this.hasLoaded = false;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
    }

    refresh() {
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const { config, warnings } = parseConfig(configContent);
            if (warnings.length > 0) {
                this.onLegacyShell(warnings);
            }
            this.groups = config.groups.map((group) => {
                const hosts = group.hosts.map(
                    (host) => new SSHHostItem(resolveConnection(group, host))
                );
                return new SSHGroupItem(group.name, hosts);
            });
            this.hasLoaded = true;
        } catch (error) {
            if (!this.hasLoaded) {
                this.groups = [];
            }
            this.onError(error);
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            return this.groups;
        }
        if (element instanceof SSHGroupItem) {
            return element.children;
        }
        return [];
    }

    getPasswordTargets() {
        const targets = [];
        for (const group of this.groups) {
            targets.push({
                label: `Group: ${group.groupName}`,
                description: 'Group password',
                targetKind: 'group',
                groupName: group.groupName
            });
            for (const host of group.children) {
                const connection = host.connection;
                targets.push({
                    label: `Host: ${connection.name} (${connection.host})`,
                    description: `${connection.user}@${connection.host}:${connection.port}`,
                    targetKind: 'host',
                    connection
                });
            }
        }
        return targets;
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

class SSHGroupItem extends vscode.TreeItem {
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.groupName = label;
        this.children = children;
        this.contextValue = 'group';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

class SSHHostItem extends vscode.TreeItem {
    constructor(connection) {
        super(`${connection.name} (${connection.host})`, vscode.TreeItemCollapsibleState.None);
        this.connection = connection;
        this.contextValue = 'host';
        this.iconPath = new vscode.ThemeIcon('server');
        this.description = `${connection.user}@${connection.host}:${connection.port}`;
        this.tooltip = [
            `HostName: ${connection.host}`,
            `Name: ${connection.name}`,
            `User: ${connection.user}`,
            `Port: ${connection.port}`,
            `IdentityFile: ${connection.identityFile || 'None'}`,
            `Group: ${connection.groupName}`,
            `Use Group Password: ${connection.useGroupPassword}`,
            `Use Identity File: ${connection.useIdentityFile}`,
            `Forward Agent: ${connection.forwardAgent}`,
            `Terminal Name: ${connection.terminalName}`
        ].join('\n');
        this.command = {
            command: 'ssh-connect.connectHost',
            title: 'Connect',
            arguments: [connection]
        };
    }
}

function targetFromItem(item) {
    if (item instanceof SSHHostItem) {
        const connection = item.connection;
        return {
            label: `${connection.name} (${connection.user}@${connection.host}:${connection.port})`,
            targetKind: 'host',
            connection
        };
    }
    if (item instanceof SSHGroupItem) {
        return {
            label: `Group ${item.groupName}`,
            targetKind: 'group',
            groupName: item.groupName
        };
    }
    return undefined;
}

function activate(context) {
    const configPath = getFixedSSHConfigPath(context);
    const output = vscode.window.createOutputChannel('SSH Connect');
    const passwords = new PasswordStore(context.secrets);
    let warnedLegacyShell = false;

    const showConfigError = (error) => {
        output.appendLine(`[config] ${error.message}`);
        vscode.window
            .showErrorMessage(`SSH Connect: ${error.message}`, 'Open configuration')
            .then((choice) => {
                if (choice) {
                    vscode.commands.executeCommand('ssh-connect.editConfig');
                }
            });
    };

    const provider = new SSHHostsProvider(configPath, {
        onError: showConfigError,
        onLegacyShell: () => {
            if (warnedLegacyShell) {
                return;
            }
            warnedLegacyShell = true;
            vscode.window.showWarningMessage(
                'SSH Connect 0.2.0 no longer supports custom shells. The defaultShell and shell settings are ignored.'
            );
        }
    });

    const treeRegistration = vscode.window.registerTreeDataProvider(
        'sshHostsView',
        provider
    );
    const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.fileName === configPath) {
            provider.refresh();
        }
    });

    const sshPath = resolveSshPath();
    const sshAvailable = sshPath === 'ssh' ? commandExists('ssh') : fs.existsSync(sshPath);
    const sshpassAvailable = process.platform !== 'win32' && commandExists('sshpass');
    const sshpassPath = findExecutable('sshpass');

    async function promptPassword(label) {
        return vscode.window.showInputBox({
            prompt: `Enter password for ${label}`,
            password: true,
            ignoreFocusOut: true
        });
    }

    async function pickTarget(action) {
        const targets = provider.getPasswordTargets();
        if (targets.length === 0) {
            vscode.window.showInformationMessage('SSH Connect: no hosts configured.');
            return undefined;
        }
        return vscode.window.showQuickPick(targets, {
            placeHolder: `${action} password for...`
        });
    }

    async function saveTarget(target) {
        const password = await promptPassword(target.label);
        if (password === undefined) {
            return;
        }
        if (password.length === 0) {
            vscode.window.showWarningMessage(
                'SSH Connect: password not saved because it is empty.'
            );
            return;
        }
        try {
            if (target.targetKind === 'host') {
                await passwords.saveHost(target.connection, password);
            } else {
                await passwords.saveGroup(target.groupName, password);
            }
            vscode.window.showInformationMessage(
                `SSH Connect: password saved for ${target.label}.`
            );
        } catch (error) {
            output.appendLine(`[password] save failed: ${error.message}`);
            vscode.window.showErrorMessage(
                `SSH Connect: could not save password: ${error.message}`
            );
        }
    }

    async function deleteTarget(target) {
        try {
            const existing =
                target.targetKind === 'host'
                    ? await passwords.getHost(target.connection)
                    : await passwords.getGroup(target.groupName);
            if (!existing) {
                vscode.window.showInformationMessage(
                    `SSH Connect: no saved password for ${target.label}.`
                );
                return;
            }
            const answer = await vscode.window.showWarningMessage(
                `Delete the saved password for ${target.label}?`,
                { modal: true },
                'Delete'
            );
            if (answer !== 'Delete') {
                return;
            }
            if (target.targetKind === 'host') {
                await passwords.deleteHost(target.connection);
            } else {
                await passwords.deleteGroup(target.groupName);
            }
            vscode.window.showInformationMessage(
                `SSH Connect: password deleted for ${target.label}.`
            );
        } catch (error) {
            output.appendLine(`[password] delete failed: ${error.message}`);
            vscode.window.showErrorMessage(
                `SSH Connect: could not delete password: ${error.message}`
            );
        }
    }

    async function savePasswordCommand(item) {
        let target = targetFromItem(item);
        if (!target) {
            target = await pickTarget('Save');
        }
        if (target) {
            await saveTarget(target);
        }
    }

    async function deletePasswordCommand(item) {
        let target = targetFromItem(item);
        if (!target) {
            target = await pickTarget('Delete');
        }
        if (target) {
            await deleteTarget(target);
        }
    }

    async function openConnection(connection, attempt = 1) {
        if (!sshAvailable) {
            vscode.window.showErrorMessage(
                'SSH Connect: OpenSSH client (ssh) was not found in PATH.'
            );
            return;
        }

        let password;
        try {
            password = await passwords.getHost(connection);
            if (!password && connection.useGroupPassword === 'yes') {
                password = await passwords.getGroup(connection.groupName);
            }
        } catch (error) {
            output.appendLine(`[password] read failed: ${error.message}`);
            vscode.window.showWarningMessage(
                'SSH Connect: could not read the saved password. Continuing without it.'
            );
        }

        const invocation = buildTerminalInvocation(
            { ...connection, password },
            process.platform,
            {
                sshPath,
                sshpassAvailable,
                sshpassPath
            }
        );

        for (const warning of invocation.warnings) {
            vscode.window.showWarningMessage(warning);
        }

        output.appendLine(
            `[connect] ${connection.user}@${connection.host}:${connection.port} attempt ${attempt}`
        );
        output.appendLine(`[command] ${invocation.command} ${invocation.args.join(' ')}`);

        const terminal = vscode.window.createTerminal({
            name: connection.terminalName,
            location: vscode.TerminalLocation.Editor,
            isTransient: true,
            shellPath: invocation.command,
            shellArgs: invocation.args,
            env: invocation.env
        });
        activeTerminals.set(terminal, { connection, attempt });
        terminal.show();
    }

    const closeListener = vscode.window.onDidCloseTerminal((terminal) => {
        const state = activeTerminals.get(terminal);
        if (!state) {
            return;
        }
        activeTerminals.delete(terminal);
        const exitCode = terminal.exitStatus ? terminal.exitStatus.code : undefined;
        output.appendLine(
            `[close] ${state.connection.user}@${state.connection.host}:${state.connection.port} exit ${
                exitCode === undefined ? 'unknown' : exitCode
            }`
        );

        if (shouldRetry(exitCode, state.attempt, state.connection.retry)) {
            const delay = retryDelayMs(state.connection.retry);
            output.appendLine(`[retry] attempt ${state.attempt + 1} in ${delay / 1000}s`);
            const timer = setTimeout(() => {
                retryTimers.delete(timer);
                openConnection(state.connection, state.attempt + 1).catch((error) => {
                    output.appendLine(`[retry] failed: ${error.message}`);
                    vscode.window.showErrorMessage(`SSH Connect: ${error.message}`);
                });
            }, delay);
            retryTimers.add(timer);
            return;
        }

        if (state.connection.retry.enabled && exitCode === 255) {
            vscode.window.showWarningMessage(
                `SSH Connect: could not reconnect to ${state.connection.host} after ${state.attempt} attempt(s).`
            );
        }
    });

    const editConfigCommand = vscode.commands.registerCommand(
        'ssh-connect.editConfig',
        async () => {
            const document = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(document);
        }
    );
    const connectHostCommand = vscode.commands.registerCommand(
        'ssh-connect.connectHost',
        (connection) => openConnection(connection, 1)
    );
    const savePasswordCommandRegistration = vscode.commands.registerCommand(
        'ssh-connect.savePassword',
        (item) => savePasswordCommand(item)
    );
    const deletePasswordCommandRegistration = vscode.commands.registerCommand(
        'ssh-connect.deletePassword',
        (item) => deletePasswordCommand(item)
    );

    context.subscriptions.push(
        provider,
        treeRegistration,
        saveListener,
        closeListener,
        output,
        editConfigCommand,
        connectHostCommand,
        savePasswordCommandRegistration,
        deletePasswordCommandRegistration
    );
}

function deactivate() {
    for (const timer of retryTimers) {
        clearTimeout(timer);
    }
    retryTimers.clear();
    activeTerminals.clear();
}

module.exports = {
    activate,
    deactivate
};
