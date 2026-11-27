'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { createDefaultConfig, parseConfig, resolveConnection } = require('./lib/config');
const { buildTerminalInvocation } = require('./lib/ssh');
const { buildLocalInvocation } = require('./lib/local');
const { PasswordStore } = require('./lib/passwords');
const { shouldRetry, retryDelayMs } = require('./lib/retry');

const activeTerminals = new Map();
const retryTimers = new Set();

function getFixedSSHConfigPath(context) {
    const configPath = path.join(context.globalStorageUri.fsPath, 'ssh-config.json');
    if (!fs.existsSync(configPath)) {
        const template = createDefaultConfig(process.platform, {
            isRemote: Boolean(vscode.env.remoteName)
        });
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

function resolveWslPath() {
    if (process.platform !== 'win32') {
        return undefined;
    }
    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    if (systemRoot) {
        const candidate = path.join(systemRoot, 'System32', 'wsl.exe');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return findExecutable('wsl.exe');
}

function openEditorTerminal({ name, shellPath, shellArgs, cwd, env }) {
    const options = {
        name,
        location: vscode.TerminalLocation.Editor,
        isTransient: true
    };
    if (shellPath) {
        options.shellPath = shellPath;
        options.shellArgs = shellArgs || [];
    }
    if (cwd) {
        options.cwd = cwd;
    }
    if (env) {
        options.env = env;
    }

    const terminal = vscode.window.createTerminal(options);
    terminal.show();
    return terminal;
}

class SSHHostsProvider {
    constructor(configPath, options = {}) {
        this.configPath = configPath;
        this.onError = options.onError || (() => {});
        this.onWarnings = options.onWarnings || (() => {});
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
                this.onWarnings(warnings);
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
            const sshHosts = group.children.filter(
                (host) => host.connection.kind === 'ssh'
            );
            if (sshHosts.length > 0) {
                targets.push({
                    label: `Group: ${group.groupName}`,
                    description: 'Group password',
                    targetKind: 'group',
                    groupName: group.groupName
                });
            }
            for (const host of sshHosts) {
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
        this.contextValue = children.some(
            (child) => child.connection.kind === 'ssh'
        )
            ? 'group'
            : 'noSshHosts';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

class SSHHostItem extends vscode.TreeItem {
    constructor(connection) {
        const kind = connection.kind;
        const isWsl = kind === 'wsl';
        const isLocal = kind === 'local';
        const isSsh = !isWsl && !isLocal;

        super(
            isSsh ? `${connection.name} (${connection.host})` : connection.name,
            vscode.TreeItemCollapsibleState.None
        );
        this.connection = connection;
        this.contextValue = isSsh ? 'host' : isWsl ? 'wslHost' : 'localHost';
        this.iconPath = new vscode.ThemeIcon(
            isSsh ? 'server' : isWsl ? 'terminal' : 'device-desktop'
        );

        if (isSsh) {
            this.description = `${connection.user}@${connection.host}:${connection.port}`;
            const tooltip = [
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
            ];
            if (connection.startCommand) {
                tooltip.push(`Start Command: ${connection.startCommand}`);
            }
            this.tooltip = tooltip.join('\n');
        } else if (isWsl) {
            this.description = `WSL · ${connection.distribution || 'default distro'}${
                connection.user ? ` · ${connection.user}` : ''
            }`;
            const tooltip = [
                'Kind: WSL',
                `Name: ${connection.name}`,
                `Distribution: ${connection.distribution || 'default'}`,
                `User: ${connection.user || 'default'}`,
                `Starting Directory: ${connection.startingDirectory || 'home'}`,
                `Group: ${connection.groupName}`,
                `Terminal Name: ${connection.terminalName}`
            ];
            if (connection.startCommand) {
                tooltip.push(`Start Command: ${connection.startCommand}`);
            }
            this.tooltip = tooltip.join('\n');
        } else {
            this.description = `Local · ${
                connection.shell ? path.basename(connection.shell) : 'default profile'
            }`;
            const shellArgs = connection.shellArgs.join(' ');
            const tooltip = [
                'Kind: Local',
                `Name: ${connection.name}`,
                `Shell: ${connection.shell || 'default profile'}`,
                `Shell Arguments: ${shellArgs || 'None'}`,
                `Starting Directory: ${connection.startingDirectory || 'VS Code default'}`,
                `Group: ${connection.groupName}`,
                `Terminal Name: ${connection.terminalName}`
            ];
            if (connection.startCommand) {
                tooltip.push(`Start Command: ${connection.startCommand}`);
            }
            this.tooltip = tooltip.join('\n');
        }

        this.command = {
            command: 'ssh-connect.connectHost',
            title: 'Connect',
            arguments: [connection]
        };
    }
}

function targetFromItem(item) {
    if (item instanceof SSHHostItem) {
        if (item.connection.kind !== 'ssh') {
            return undefined;
        }
        const connection = item.connection;
        return {
            label: `${connection.name} (${connection.user}@${connection.host}:${connection.port})`,
            targetKind: 'host',
            connection
        };
    }
    if (item instanceof SSHGroupItem) {
        if (item.contextValue !== 'group') {
            return undefined;
        }
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
    const shownWarnings = new Set();

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

    const showWarnings = (warnings) => {
        for (const warning of warnings) {
            if (shownWarnings.has(warning)) {
                continue;
            }
            shownWarnings.add(warning);
            vscode.window.showWarningMessage(warning);
        }
    };

    const provider = new SSHHostsProvider(configPath, {
        onError: showConfigError,
        onWarnings: showWarnings
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
    const wslPath = resolveWslPath();
    const wslAvailable =
        wslPath !== undefined &&
        (wslPath === 'wsl.exe' ? commandExists('wsl.exe') : fs.existsSync(wslPath));

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
            vscode.window.showInformationMessage(
                'SSH Connect: no SSH hosts available for passwords.'
            );
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
        if (connection.kind === 'local') {
            if (vscode.env.remoteName) {
                vscode.window.showErrorMessage(
                    'SSH Connect: local terminals are only available in local windows.'
                );
                return;
            }

            const invocation = buildLocalInvocation(connection);
            output.appendLine(`[connect] local ${connection.name} attempt ${attempt}`);
            output.appendLine(
                `[command] ${invocation.command} ${invocation.logArgs.join(' ')}`
            );

            const terminal = openEditorTerminal({
                name: connection.terminalName,
                shellPath: invocation.shellPath,
                shellArgs: invocation.shellArgs,
                cwd: connection.startingDirectory || undefined
            });
            activeTerminals.set(terminal, { connection, attempt });
            return;
        }

        if (connection.kind === 'wsl') {
            if (!wslAvailable) {
                vscode.window.showErrorMessage(
                    'SSH Connect: WSL is only available on Windows and requires wsl.exe.'
                );
                return;
            }

            const invocation = buildTerminalInvocation(connection, process.platform, {
                wslPath
            });
            output.appendLine(
                `[connect] wsl ${connection.distribution || 'default'}${
                    connection.user ? ` user ${connection.user}` : ''
                } attempt ${attempt}`
            );
            output.appendLine(
                `[command] ${invocation.command} ${(invocation.logArgs || invocation.args).join(' ')}`
            );

            const terminal = openEditorTerminal({
                name: connection.terminalName,
                shellPath: invocation.command,
                shellArgs: invocation.args,
                env: invocation.env
            });
            activeTerminals.set(terminal, { connection, attempt });
            return;
        }

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
        output.appendLine(
            `[command] ${invocation.command} ${(invocation.logArgs || invocation.args).join(' ')}`
        );

        const terminal = openEditorTerminal({
            name: connection.terminalName,
            shellPath: invocation.command,
            shellArgs: invocation.args,
            env: invocation.env
        });
        activeTerminals.set(terminal, { connection, attempt });
    }

    const closeListener = vscode.window.onDidCloseTerminal((terminal) => {
        const state = activeTerminals.get(terminal);
        if (!state) {
            return;
        }
        activeTerminals.delete(terminal);
        const exitCode = terminal.exitStatus ? terminal.exitStatus.code : undefined;

        if (state.connection.kind === 'local') {
            output.appendLine(
                `[close] local ${state.connection.name} exit ${
                    exitCode === undefined ? 'unknown' : exitCode
                }`
            );
            return;
        }

        if (state.connection.kind === 'wsl') {
            output.appendLine(
                `[close] wsl ${state.connection.distribution || 'default'} exit ${
                    exitCode === undefined ? 'unknown' : exitCode
                }`
            );
            return;
        }

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
