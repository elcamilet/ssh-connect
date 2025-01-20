import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function getFixedSSHConfigPath(context: vscode.ExtensionContext): string {
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

class SSHHostsProvider implements vscode.TreeDataProvider<SSHTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SSHTreeItem | undefined | void> = new vscode.EventEmitter<
        SSHTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: vscode.Event<SSHTreeItem | undefined | void> = this._onDidChangeTreeData.event;
    private groups: SSHGroupItem[] = [];
    constructor(private configPath: string) {
        this.refresh();
    }

    refresh(): void {
        const groupItems: SSHGroupItem[] = [];
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const config = JSON.parse(configContent);
            for (const group of config.groups) {
                const hosts = group.hosts.map((host: any) => {
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

    getTreeItem(element: SSHTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SSHTreeItem): SSHTreeItem[] {
        if (!element) {
            return this.groups;
        }
        if (element instanceof SSHGroupItem) {
            return element.children;
        }
        return [];
    }
}

abstract class SSHTreeItem extends vscode.TreeItem {}

class SSHGroupItem extends SSHTreeItem {
    constructor(public readonly label: string, public readonly children: SSHHostItem[]) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
    }
}

class SSHHostItem extends SSHTreeItem {
    constructor(
        public readonly shell: string,
        public readonly host: string,
        public readonly name: string,
        public readonly user: string,
        public readonly port: string,
        public readonly identityFile: string | undefined
    ) {
        super(`${name} (${host})`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `HostName: ${name}\nUser: ${user}\nPort: ${port}\nIdentityFile: ${identityFile || 'None'}`;
        this.command = {
            command: 'ssh-connect.connectHost',
            title: 'Connect',
            arguments: [host, user, port, identityFile, shell],
        };
        this.contextValue = 'host';
    }
}

export function activate(context: vscode.ExtensionContext) {
    const fixedConfigPath = getFixedSSHConfigPath(context);
    const sshHostsProvider = new SSHHostsProvider(fixedConfigPath);
    vscode.window.registerTreeDataProvider('sshHostsView', sshHostsProvider);
    vscode.commands.registerCommand('workbench.action.files.save', () => {
        sshHostsProvider.refresh();
    });
    const connectHostCommand = vscode.commands.registerCommand(
        'ssh-connect.connectHost',
        (host: string, user: string, port: string, identityFile: string | undefined, shell: string) => {
            if (!shell) { shell = "/bin/bash"; }
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
        }
    );
    const refreshHostsCommand = vscode.commands.registerCommand('ssh-connect.refreshHosts', () => {
        sshHostsProvider.refresh();
    });
    const editConfigCommand = vscode.commands.registerCommand('ssh-connect.editConfig', () => {
        vscode.workspace.openTextDocument(fixedConfigPath).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    });
    context.subscriptions.push(connectHostCommand, refreshHostsCommand, editConfigCommand);
}
