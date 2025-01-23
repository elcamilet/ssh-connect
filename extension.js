const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function getFixedSSHConfigPath(context) {
    const configPath = path.join(context.globalStorageUri.fsPath, 'ssh-config.json');
    if (!fs.existsSync(configPath)) {
        const template = {
            defaultShell: "/bin/bash",
            groups: [
                {
                    name: "DevServers",
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
                        }
                    ]
                },
                {
                    name: "ProdServers",
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
                        host.shell || config.defaultShell,
                        host.host,
                        host.name,
                        host.user || group.defaultUser,
                        host.port || group.defaultPort,
                        host.identityFile || group.defaultIdentityFile
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

class SSHTreeItem extends vscode.TreeItem {}

class SSHGroupItem extends SSHTreeItem {
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.contextValue = 'group';
    }
}

class SSHHostItem extends SSHTreeItem {
    constructor(shell, host, name, user, port, identityFile) {
        super(`${name} (${host})`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `HostName: ${name}\nUser: ${user}\nPort: ${port}\nIdentityFile: ${identityFile || 'None'}`;
        this.command = {
            command: 'ssh-connect.connectHost',
            title: 'Connect',
            arguments: [host, user, port, identityFile, shell]
        };
        this.contextValue = 'host';
    }
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
    
    const connectHostCommand = vscode.commands.registerCommand('ssh-connect.connectHost', (host, user, port, identityFile, shell) => {
        if (!shell) shell = "/bin/bash";
        const identityOption = identityFile ? `-i ${identityFile}` : '';
        const sshCommand = `ssh ${identityOption} ${user}@${host} -p ${port}`;
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
    });

    const editConfigCommand = vscode.commands.registerCommand('ssh-connect.editConfig', () => {
        vscode.workspace.openTextDocument(fixedConfigPath).then(doc => {
            setTimeout(() => {
                vscode.window.showTextDocument(doc);
            }, 100);
        });
    });

    context.subscriptions.push(connectHostCommand, editConfigCommand);
}

module.exports = {
    activate
};

