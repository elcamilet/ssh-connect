'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function makeVscode(remoteName, state) {
    class EventEmitter {
        constructor() {
            this.listeners = [];
            this.event = (listener) => {
                this.listeners.push(listener);
                return { dispose() {} };
            };
        }

        fire(value) {
            for (const listener of this.listeners) {
                listener(value);
            }
        }

        dispose() {}
    }

    class TreeItem {
        constructor(label, collapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    }

    class ThemeIcon {
        constructor(id) {
            this.id = id;
        }
    }

    return {
        env: { remoteName },
        EventEmitter,
        TreeItem,
        ThemeIcon,
        TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
        TerminalLocation: { Editor: 1 },
        window: {
            createOutputChannel() {
                return {
                    lines: state.outputLines,
                    appendLine(line) {
                        this.lines.push(line);
                    },
                    dispose() {}
                };
            },
            createTerminal(options) {
                state.terminals.push(options);
                const terminal = {
                    options,
                    shown: false,
                    exitStatus: undefined,
                    show() {
                        this.shown = true;
                    },
                    dispose() {}
                };
                state.lastTerminal = terminal;
                return terminal;
            },
            registerTreeDataProvider(id, provider) {
                state.provider = provider;
                return { dispose() {} };
            },
            onDidCloseTerminal(handler) {
                state.closeHandler = handler;
                return { dispose() {} };
            },
            showErrorMessage(message) {
                state.errors.push(message);
                return Promise.resolve(undefined);
            },
            showWarningMessage(message) {
                state.warnings.push(message);
                return Promise.resolve(undefined);
            },
            showInformationMessage(message) {
                state.infos.push(message);
                return Promise.resolve(undefined);
            },
            showInputBox() {
                state.inputBoxes += 1;
                return Promise.resolve(undefined);
            },
            showQuickPick(items) {
                state.quickPicks.push(items);
                return Promise.resolve(undefined);
            },
            showTextDocument() {
                return Promise.resolve(undefined);
            }
        },
        workspace: {
            onDidSaveTextDocument() {
                return { dispose() {} };
            },
            openTextDocument() {
                return Promise.resolve({});
            }
        },
        commands: {
            registerCommand(id, handler) {
                state.commands.set(id, handler);
                return { dispose() {} };
            },
            executeCommand() {
                return Promise.resolve(undefined);
            }
        }
    };
}

function makeState() {
    return {
        outputLines: [],
        terminals: [],
        lastTerminal: undefined,
        provider: undefined,
        closeHandler: undefined,
        errors: [],
        warnings: [],
        infos: [],
        quickPicks: [],
        inputBoxes: 0,
        commands: new Map()
    };
}

function loadExtension(remoteName, state, storageDir, secrets) {
    const vscode = makeVscode(remoteName, state);
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return vscode;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve(path.join(__dirname, '../../extension.js'))];
        const extension = require(path.join(__dirname, '../../extension.js'));
        const context = {
            subscriptions: [],
            secrets,
            globalStorageUri: { fsPath: storageDir }
        };
        extension.activate(context);
        return extension;
    } finally {
        Module._load = originalLoad;
    }
}

function makeSecrets() {
    return {
        gets: 0,
        get() {
            this.gets += 1;
            return Promise.resolve(undefined);
        },
        store() {
            return Promise.resolve();
        },
        delete() {
            return Promise.resolve();
        }
    };
}

function localConnection(overrides = {}) {
    return {
        kind: 'local',
        name: 'Probe local',
        startingDirectory: '/tmp',
        shell: 'bash',
        shellArgs: ['-lic'],
        startCommand: 'echo probe-secret-token',
        terminalName: 'Probe local',
        groupName: 'Local',
        ...overrides
    };
}

function wslConnection(overrides = {}) {
    return {
        kind: 'wsl',
        name: 'WSL',
        distribution: 'Ubuntu-22.04',
        user: os.userInfo().username,
        startingDirectory: '/home/dev',
        startCommand: '',
        terminalName: 'WSL',
        groupName: 'Local',
        ...overrides
    };
}

test('local terminal extension flow', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-connect-test-'));
    const remoteDir = path.join(root, 'remote');
    const localDir = path.join(root, 'local');
    const previousWslDistro = process.env.WSL_DISTRO_NAME;
    let extension;

    try {
        process.env.WSL_DISTRO_NAME = 'Ubuntu-22.04';
        const remoteSecrets = makeSecrets();
        const remoteState = makeState();
        extension = loadExtension('ssh-remote', remoteState, remoteDir, remoteSecrets);

        const remoteConfig = JSON.parse(
            fs.readFileSync(path.join(remoteDir, 'ssh-config.json'), 'utf8')
        );
        assert.equal(
            remoteConfig.groups.some((group) => group.name === 'Local'),
            false
        );

        await remoteState.commands.get('ssh-connect.connectHost')(localConnection());
        assert.equal(remoteState.terminals.length, 0);
        assert.match(remoteState.errors[0], /only available in local windows/);
        assert.equal(remoteSecrets.gets, 0);

        extension.deactivate();

        const wslDir = path.join(root, 'wsl');
        const wslSecrets = makeSecrets();
        const wslState = makeState();
        extension = loadExtension(
            'wsl',
            wslState,
            wslDir,
            wslSecrets
        );

        const wslConfig = JSON.parse(
            fs.readFileSync(path.join(wslDir, 'ssh-config.json'), 'utf8')
        );
        assert.equal(
            wslConfig.groups.some((group) => group.name === 'Local'),
            false
        );

        await wslState.commands.get('ssh-connect.connectHost')(
            wslConnection({ startCommand: 'opencode' })
        );
        const wslOptions = wslState.terminals[0];
        assert.equal(wslOptions.shellPath, 'bash');
        assert.deepEqual(wslOptions.shellArgs, ['-lic', 'opencode']);
        assert.equal(wslOptions.cwd, '/home/dev');
        assert.equal(wslState.errors.length, 0);
        assert.equal(wslSecrets.gets, 0);
        const wslLog = wslState.outputLines.find((line) =>
            line.includes('<startCommand>')
        );
        assert.ok(wslLog);
        assert.equal(wslLog.includes('opencode'), false);

        await wslState.commands.get('ssh-connect.connectHost')(
            wslConnection({ startCommand: '' })
        );
        const defaultWslOptions = wslState.terminals[1];
        assert.equal(defaultWslOptions.shellPath, undefined);
        assert.equal(defaultWslOptions.shellArgs, undefined);
        assert.equal(defaultWslOptions.cwd, '/home/dev');

        await wslState.commands.get('ssh-connect.connectHost')(
            wslConnection({
                distribution: 'Ubuntu-24.04',
                user: 'someone-else',
                startCommand: ''
            })
        );
        assert.equal(wslState.warnings.length, 2);
        assert.equal(wslState.terminals.length, 3);

        extension.deactivate();

        const localSecrets = makeSecrets();
        const localState = makeState();
        extension = loadExtension(undefined, localState, localDir, localSecrets);

        const localConfig = JSON.parse(
            fs.readFileSync(path.join(localDir, 'ssh-config.json'), 'utf8')
        );
        assert.equal(localConfig.groups[0].name, 'Local');
        assert.equal(localConfig.groups[0].hosts[0].type, 'local');
        assert.equal(localConfig.groups[0].hosts[0].name, 'Local terminal');
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(path.join(localDir, 'ssh-config.json')).mode & 0o777, 0o600);
        }

        const connection = localConnection();
        await localState.commands.get('ssh-connect.connectHost')(connection);

        const options = localState.terminals[0];
        assert.equal(options.shellPath, 'bash');
        assert.deepEqual(options.shellArgs, ['-lic', connection.startCommand]);
        assert.equal(options.cwd, '/tmp');
        assert.equal(localSecrets.gets, 0);
        assert.equal(options.env, undefined);

        const logLine = localState.outputLines.find((line) =>
            line.includes('<startCommand>')
        );
        assert.ok(logLine);
        assert.equal(logLine.includes('probe-secret-token'), false);

        await localState.commands.get('ssh-connect.connectHost')(
            localConnection({
                shell: '',
                shellArgs: [],
                startCommand: '',
                startingDirectory: ''
            })
        );
        const defaultOptions = localState.lastTerminal.options;
        assert.equal(defaultOptions.shellPath, undefined);
        assert.equal(defaultOptions.shellArgs, undefined);
        assert.equal(defaultOptions.cwd, undefined);

        const targets = localState.provider.getPasswordTargets();
        assert.ok(
            targets.every(
                (target) =>
                    target.targetKind !== 'host' || target.connection.kind === 'ssh'
            )
        );
        assert.equal(
            targets.some(
                (target) =>
                    target.targetKind === 'group' && target.groupName === 'Local'
            ),
            false
        );
        const localGroup = localState.provider
            .getChildren()
            .find((group) => group.groupName === 'Local');
        assert.equal(localGroup.contextValue, 'noSshHosts');

        const terminal = localState.lastTerminal;
        terminal.exitStatus = { code: 0 };
        assert.doesNotThrow(() => localState.closeHandler(terminal));
        assert.ok(
            localState.outputLines.some((line) => line.startsWith('[close] local'))
        );

        extension.deactivate();
    } finally {
        if (previousWslDistro === undefined) {
            delete process.env.WSL_DISTRO_NAME;
        } else {
            process.env.WSL_DISTRO_NAME = previousWslDistro;
        }
        fs.rmSync(root, { recursive: true, force: true });
    }
});
