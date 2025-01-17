import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Ruta fija del archivo JSON de configuración SSH
function getFixedSSHConfigPath(context: vscode.ExtensionContext): string {
    const configPath = path.join(context.globalStorageUri.fsPath, 'ssh-config.json');
    if (!fs.existsSync(configPath)) {
        // Crear el archivo con una plantilla básica si no existe
        const template = {
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

// TreeDataProvider para manejar los hosts SSH y sus grupos
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
        console.log('Refreshing SSH Hosts...');
        const groupItems: SSHGroupItem[] = [];

        try {
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const config = JSON.parse(configContent);

            for (const group of config.groups) {
                const hosts = group.hosts.map((host: any) => {
                    return new SSHHostItem(
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

        this.groups = groupItems; // Actualiza los grupos
        console.log('Groups found:', groupItems.map(group => group.label));
        this._onDidChangeTreeData.fire(); // Notifica el cambio al TreeView
    }

    getTreeItem(element: SSHTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SSHTreeItem): SSHTreeItem[] {
        if (!element) {
            return this.groups; // Devuelve los grupos en la raíz
        }
        if (element instanceof SSHGroupItem) {
            return element.children; // Devuelve los hosts dentro del grupo
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
            arguments: [host, user, port, identityFile],
        };
        this.contextValue = 'host';
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Ruta fija del archivo JSON de configuración SSH
    const fixedConfigPath = getFixedSSHConfigPath(context);

    // TreeDataProvider para la vista SSH Hosts
    const sshHostsProvider = new SSHHostsProvider(fixedConfigPath);
    vscode.window.registerTreeDataProvider('sshHostsView', sshHostsProvider);

    // Watcher para refrescar los hosts cuando se guarda el archivo de configuración
    const configWatcher = vscode.workspace.createFileSystemWatcher(fixedConfigPath);

    configWatcher.onDidChange(() => sshHostsProvider.refresh());
    configWatcher.onDidCreate(() => sshHostsProvider.refresh());
    configWatcher.onDidDelete(() => sshHostsProvider.refresh());

    context.subscriptions.push(configWatcher);

    // Command: SSH Connect
    const connectHostCommand = vscode.commands.registerCommand(
        'ssh-connect.connectHost',
        (host: string, user: string, port: string, identityFile: string | undefined) => {
            const identityOption = identityFile ? `-i ${identityFile}` : '';
            const sshCommand = `ssh ${identityOption} ${user}@${host} -p ${port}`;
            const terminal = vscode.window.createTerminal({
                name: host,
                location: vscode.TerminalLocation.Editor,
                isTransient: true,
            });
            terminal.sendText(sshCommand);
            terminal.show(true); // Abrir a pantalla completa
        }
    );

    // Command: Refresh SSH Hosts
    const refreshHostsCommand = vscode.commands.registerCommand('ssh-connect.refreshHosts', () => {
        sshHostsProvider.refresh();
    });

    // Command: Edit Fixed SSH Config
    const editConfigCommand = vscode.commands.registerCommand('ssh-connect.editConfig', () => {
        vscode.workspace.openTextDocument(fixedConfigPath).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    });

    context.subscriptions.push(connectHostCommand, refreshHostsCommand, editConfigCommand);
}
