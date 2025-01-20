
# SSH Connect by elCamilet

**SSH Connect** is a Visual Studio Code extension that allows you to manage and connect to SSH servers directly from the interface. It provides a hierarchical view to organize your servers into groups, make quick connections, and easily edit configurations.

## Features

- **Hierarchical view of SSH servers**:
  - Group and organize your servers by categories (e.g., Development, Production).
  - View server details like name, user, port, and SSH identity file in configiguration.

- **Quick server connection**:
  - Connect to a server with a single click from the SSH servers tree.

- **Customizable configuration**:
  - Auto-generated JSON configuration file to define groups and servers.

- **Real-time updates**:
  - Saved changes in the configuration file are automatically reflected in the view.

## Screenshots
![Configuration file](https://raw.githubusercontent.com/elcamilet/ssh-connect/refs/heads/master/readme_config.png)

![SSH Connection](https://raw.githubusercontent.com/elcamilet/ssh-connect/refs/heads/master/readme_connection.png)

## Installation

1. Open the **VS Code Marketplace** and search for `SSH Connect`.
2. Click **Install**.

Or install it using the VS Code CLI:

```bash
code --install-extension ssh-connect
```

## Usage

1. **Open the SSH Hosts view**:
   - Navigate to the sidebar and find the **SSH Hosts** view.

2. **Connect to a server**:
   - Click on a server to start an SSH connection in an integrated terminal.

3. **Edit configuration**:
   - Use the `Edit Config` command from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) to edit the `ssh-config.json` file.

4. **Refresh the view**:
   - If you manually edited the configuration, run `Refresh Hosts` from the command palette to refresh the view.

## Available Commands

| Command                          | Description                                      |
|----------------------------------|--------------------------------------------------|
| `Refresh Hosts`     | Refresh the list of hosts in the view.           |
| `Edit Config`       | Open the fixed JSON configuration file.          |

## Configuration File

The configuration file is located at:  
`<global_storage_folder>/ssh-config.json`

### Example Structure:

```json
{
  "groups": [
    {
      "name": "DevServers",
      "defaultUser": "root",
      "defaultPort": 22,
      "defaultIdentityFile": "",
      "hosts": [
        {
          "host": "dev1.example.com",
          "name": "Development Server 1",
          "user": "devuser",
          "port": 2222,
          "identityFile": "~/.ssh/dev-cert.pem"
        },
        {
          "host": "10.10.0.1",
          "name": "Development Server 2"
        }
      ]
    },
    {
      "name": "ProdServers",
      "defaultUser": "ec2-user",
      "defaultPort": 22,
      "defaultIdentityFile": "/path/to/prod-cert.pem",
      "hosts": [
        {
          "host": "example.com",
          "name": "Production Server 1",
          "user": "admin",
          "port": 22,
          "identityFile": "~/.ssh/prod-cert.pem"
        }
      ]
    }
  ]
}
```

## Requirements

- Node.js v14 or higher (for extension development).
- An operating system that supports integrated terminals in Visual Studio Code, like Linux. 

## Known Issues

- The `ssh-config.json` file must exist for the extension to work correctly. If it does not exist, it will be automatically created with a basic template.

## Developer

This extension is developed by Camilo Nevot ([elCamilet](https://github.com/elcamilet)) and is published as is, without any guarantees or support. If you find any issues or have suggestions for improvements, please open an issue on the [GitHub repository](https://github.com/elcamilet/ssh-connect).

Enjoy this extension and make working with SSH connections from VS Code easier! 🚀

## License

[MIT](https://github.com/elcamilet/ssh-connect/blob/master/LICENSE)
