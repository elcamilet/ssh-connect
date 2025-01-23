const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const keytar = require('keytar');

function getFixedSSHConfigPath(context) {
    const configPath = path.join(context.globalStorageUri.fsPath, 'ssh-config.json');
    if (!fs.existsSync(configPath)) {
        const template = {
            defaultShell: "/bin/bash",
            groups: [
                {
                    name: "Development",
                    defaultUser: "root",
                    defaultPort: 22,
                    defaultIdentityFile: "",
                    hosts: [
                        {
                            host: "dev1.example.com",
                            name: "Development Server 1",
                            user: "devuser",
                            port: 2222,
                            identityFile: "~/.ssh/dev-cert.pem"
                        },
                        {
                            host: "10.10.0.1",
                            name: "Development Server 2"
                        },
                        {
                            host: "10.10.0.2",
                            name: "Development Server 3",
                            user: "devuser2",
                            port: 222,
                            identityFile: "/tmp/cert.pem",
                            useGroupPassword: "no",
                            useIdentityFile: "yes"
                        }
                    ]
                },
                {
                    name: "Production",
                    defaultUser: "ec2-user",
                    defaultPort: 22,
                    defaultIdentityFile: "/path/to/prod-cert.pem",
                    hosts: [
                        {
                            host: "example.com",
                            name: "Production Server 1",
                            user: "admin",
                            port: 22,
                            identityFile: "~/.ssh/prod-cert.pem"
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

class SSHHostsProvider {
    constructor(configPath) {
        this.configPath = configPath;
        this.groups = [];
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
    }

    refresh() {
        const groupItems = [];
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const config = JSON.parse(configContent);

            for (const group of config.groups) {
                const hosts = group.hosts.map((host) => {
                    return new SSHHostItem(
                        host.shell || config.defaultShell || "/bin/bash",
                        host.host,
                        host.name,
                        host.user || group.defaultUser || "root",
                        host.port || group.defaultPort || 22,
                        host.identityFile || group.defaultIdentityFile || "",
                        host.group || group.name,
                        host.useGroupPassword || "yes",
                        host.useIdentityFile || "yes"
                    );
                });
                groupItems.push(new SSHGroupItem(group.name, hosts));
            }
        } catch (error) {
            console.error(`Error reading ${this.configPath}: ${error}`);
        }
        this.groups = groupItems;
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
}

class SSHTreeItem extends vscode.TreeItem { }

class SSHGroupItem extends SSHTreeItem {
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.contextValue = 'group';
    }
}

class SSHHostItem extends SSHTreeItem {
    constructor(shell, host, name, user, port, identityFile, group, useGroupPassword, useIdentityFile) {
        super(`${name} (${host})`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `HostName: ${name}\nUser: ${user}\nPort: ${port}\nIdentityFile: ${identityFile || 'None'}\nUse Group Password: ${useGroupPassword}\nUse Identity file: ${useIdentityFile}`;
        this.command = {
            command: 'ssh-connect.connectHost',
            title: 'Connect',
            arguments: [host, user, port, identityFile, shell, group, useGroupPassword, useIdentityFile]
        };
        this.contextValue = 'host';
    }
}

async function savePassword(service, account, password) {
    await keytar.setPassword(service, account, password);
    vscode.window.showInformationMessage(`Password saved for ${account}`);
}

async function getPassword(service, account) {
    return await keytar.getPassword(service, account);
}

async function deletePassword(service, account) {
    await keytar.deletePassword(service, account);
    vscode.window.showInformationMessage(`Password deleted for ${account}`);
}

function activate(context) {
    const fixedConfigPath = getFixedSSHConfigPath(context);
    const sshHostsProvider = new SSHHostsProvider(fixedConfigPath);
    vscode.window.registerTreeDataProvider('sshHostsView', sshHostsProvider);
    vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.fileName === fixedConfigPath && fs.existsSync(fixedConfigPath)) {
            sshHostsProvider.refresh();
        }
    });
    const connectHostCommand = vscode.commands.registerCommand('ssh-connect.connectHost', async (host, user, port, identityFile, shell, group, useGroupPassword, useIdentityFile) => {
        if (!shell) shell = "/bin/bash";
        let identityOption = identityFile ? `-i ${identityFile}` : '';
        if (useIdentityFile === "no") {
            identityOption = '';
        }
        let sshCommand;
        try {
            let password = await getPassword('SSHConnect', host);
            if (!password && useGroupPassword === "yes") {
                password = await getPassword('SSHConnect', group);
            }
            if (password) {
                sshCommand = `sshpass -p '${password}' ssh ${user}@${host} -p ${port}`;
            } else {
                sshCommand = `ssh ${identityOption} ${user}@${host} -p ${port}`;
            }
            const terminal = vscode.window.createTerminal({
                name: host,
                location: vscode.TerminalLocation.Editor,
                isTransient: true,
                shellPath: shell,
                shellArgs: ['-c', sshCommand]
            });
            terminal.show(true);
            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.terminal.focus');
            }, 100);
        } catch (error) {
            vscode.window.showErrorMessage(`Error connecting to host: ${error.message}`);
        }
    });
    const savePasswordCommand = vscode.commands.registerCommand('ssh-connect.savePassword', async () => {
        const host = await vscode.window.showInputBox({
            prompt: 'Enter group name or individual host (ip or endpoint)',
            value: 'Dev Servers or 10.10.0.1'
        });
        const password = await vscode.window.showInputBox({
            prompt: `Enter password for ${host}`,
            password: true
        });
        if (password) {
            await savePassword('SSHConnect', host, password);
        } else {
            vscode.window.showWarningMessage(`Password not saved!`);
        }
    });
    const deletePasswordCommand = vscode.commands.registerCommand('ssh-connect.deletePassword', async () => {
        const host = await vscode.window.showInputBox({
            prompt: 'Enter group name or individual host (ip or endpoint)',
            value: 'Dev Servers or 10.10.0.1'
        });
        if (host) {
            await deletePassword('SSHConnect', host);
        } else {
            vscode.window.showWarningMessage(`Password not deleted!`);
        }
    });
    const editConfigCommand = vscode.commands.registerCommand('ssh-connect.editConfig', () => {
        vscode.workspace.openTextDocument(fixedConfigPath).then(doc => {
            setTimeout(() => {
                vscode.window.showTextDocument(doc);
            }, 100);
        });
    });
    context.subscriptions.push(connectHostCommand, deletePasswordCommand, savePasswordCommand, editConfigCommand);
}

module.exports = {
    activate
};
