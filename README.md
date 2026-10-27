# SSH Connect by elCamilet

**SSH Connect** is a Visual Studio Code extension that lets you manage and connect to SSH servers directly from the editor. It provides a hierarchical view of groups and hosts, quick connections in an editor terminal, and optional password storage using VS Code's SecretStorage.

## Features

- **Hierarchical SSH hosts view** grouped by category.
- **Quick connections** from the tree, using the system OpenSSH client.
- **Configuration file** stored in VS Code global storage.
- **Saved passwords** in VS Code SecretStorage (no native keychain module).
- **Password fallback per group** for hosts that do not have their own password.
- **Configurable terminal labels** with placeholders.
- **SSH agent forwarding** per host/group.
- **Keep-alive and optional reconnection** with configurable retries.
- **Refresh on save** when the configuration file changes.

## Requirements

- VS Code `1.96.0` or newer.
- An OpenSSH client (`ssh`) available in `PATH`.
- `sshpass` is optional and only used for saved passwords on Linux/macOS. If it is missing, SSH Connect opens a normal `ssh` session and asks for the password in the terminal.
- Windows and macOS support is **best-effort** in 0.2.0.
- Linux and WSL x86-64 and ARM64 are the officially supported platforms.

`sshpass` is not used on Windows. Windows connections use an SSH key/agent or the interactive OpenSSH password prompt.

## Installation

Search for **SSH Connect** in the VS Code Marketplace, or install it with the full extension ID:

```bash
code --install-extension elcamilet.ssh-connect
```

## Usage

1. Open the **SSH Connect** view in the activity bar.
2. Click a host to open an SSH connection in an editor-area terminal.
3. Use **Edit configuration file** from the view title or the command palette to edit `ssh-config.json`.
4. Use **Save password for group or host** from the view title, the command palette, or the context menu of a host/group.
5. Use **Delete saved password for group or host** from the same locations.

### Commands

| Command | Description |
|---|---|
| `SSH Connect: Edit configuration file` | Open the configuration file. |
| `SSH Connect: Save password for group or host` | Save a password for a host or group. |
| `SSH Connect: Delete saved password for group or host` | Delete a saved password. |

## Configuration File

The configuration file is located at:

```text
<global_storage_folder>/ssh-config.json
```

On stable VS Code for Linux, this is usually:

```text
~/.config/Code/User/globalStorage/elcamilet.ssh-connect/ssh-config.json
```

The file is created automatically with a small example if it does not exist.

### Example

```json
{
  "groups": [
    {
      "name": "Development",
      "defaultUser": "root",
      "defaultPort": 22,
      "defaultIdentityFile": "",
      "forwardAgent": "no",
      "connectTimeout": 10,
      "serverAliveInterval": 30,
      "serverAliveCountMax": 3,
      "retry": {
        "enabled": false,
        "maxAttempts": 3,
        "delaySeconds": 5
      },
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
        },
        {
          "host": "10.10.0.2",
          "name": "Development Server 3",
          "user": "devuser2",
          "port": 222,
          "identityFile": "/tmp/cert.pem",
          "useGroupPassword": "no",
          "useIdentityFile": "yes",
          "terminalName": "{name} ({user}@{host}:{port})",
          "forwardAgent": "no"
        }
      ]
    }
  ]
}
```

### Group fields

| Field | Description |
|---|---|
| `name` | Group name. Also used as the group password key. |
| `defaultUser` | Default SSH user. Falls back to `root`. |
| `defaultPort` | Default SSH port. Falls back to `22`. |
| `defaultIdentityFile` | Default identity file. |
| `forwardAgent` | `"yes"` or `"no"`. Defaults to `"no"`. |
| `connectTimeout` | SSH `ConnectTimeout` in seconds. Defaults to `10`. |
| `serverAliveInterval` | SSH keep-alive interval in seconds. Defaults to `30`. |
| `serverAliveCountMax` | SSH keep-alive count. Defaults to `3`. |
| `retry` | Optional retry configuration, see below. |
| `hosts` | Array of host objects. |

### Host fields

| Field | Description |
|---|---|
| `host` | Hostname or IP address. Required. |
| `name` | Visible name. Required. |
| `user` | SSH user. Overrides `defaultUser`. |
| `port` | SSH port. Overrides `defaultPort`. |
| `identityFile` | Identity file. Overrides `defaultIdentityFile`. |
| `group` | Optional group name used for the group password lookup. |
| `useGroupPassword` | `"yes"` or `"no"`. Defaults to `"yes"`. |
| `useIdentityFile` | `"yes"` or `"no"`. Defaults to `"yes"`. |
| `terminalName` | Terminal label. Supports `{name}`, `{user}`, `{host}` and `{port}`. Defaults to `{user}@{host}`. |
| `forwardAgent` | `"yes"` or `"no"`. Overrides the group setting. |
| `connectTimeout` | Overrides the group value. |
| `serverAliveInterval` | Overrides the group value. |
| `serverAliveCountMax` | Overrides the group value. |
| `retry` | Overrides the group retry configuration. |

`useGroupPassword` and `useIdentityFile` also accept booleans.

### Retry configuration

```json
{
  "enabled": false,
  "maxAttempts": 3,
  "delaySeconds": 5
}
```

Retries are opt-in. SSH Connect only retries exit code `255` (connection failure), up to `maxAttempts` total attempts, with a delay between attempts. Closing the terminal manually does not trigger a retry. Attempts and exit codes are logged in the **SSH Connect** output channel.

The terminal scrollback of a closed terminal is not preserved.

## Passwords

Passwords are stored in VS Code SecretStorage, never in `ssh-config.json`.

- Host password key: `user@host:port`.
- Group password key: group name.
- The host password is tried first, then the group password when `useGroupPassword` is not `"no"`.
- Passwords saved by version 0.1.x using `keytar` are not migrated. Re-enter them once after upgrading.

On Windows, saved passwords are not injected into the SSH command. Use an SSH key/agent or type the password at the OpenSSH prompt.

`sshpass` passes the password through the `SSHPASS` environment variable instead of the command line. Prefer SSH keys or an agent when possible.

## Shortcuts and context menu

- **Host context menu:** save/delete the host password.
- **Group context menu:** save/delete the group password.
- **View title and command palette:** choose a host/group from a quick pick.

## Troubleshooting

### The view is empty after upgrading

Check the **SSH Connect** output channel and the error notification. If `ssh-config.json` is invalid, the extension keeps the last valid tree and offers **Open configuration**.

### Custom shell settings no longer work

Custom shells were removed in 0.2.0. `defaultShell`, `host.shell` and `group.shell` are ignored with a one-time warning. SSH Connect runs `ssh`/`sshpass` directly.

### Saved passwords are not used on Linux/WSL

Install `sshpass`:

```bash
sudo apt install sshpass
```

If it is not installed, SSH Connect still opens the connection and lets OpenSSH ask for the password.

### WSL: extension does not activate

0.2.0 no longer uses `keytar` or `libsecret`. If you still see an activation error, open the **SSH Connect** output channel and the Extension Host log, and report the error with the VS Code version.

### Windows: `ssh` was not found

Install the OpenSSH Client optional feature or ensure `ssh.exe` is in `PATH`. SSH Connect checks `%SystemRoot%\System32\OpenSSH\ssh.exe` first.

## Limitations in 0.2.0

- Unit tests only; no CI and no real SSH connection tests were run for this release.
- Password authentication via `sshpass` is best-effort and has not been validated live.
- Windows and macOS are best-effort.
- Reconnection creates a new terminal; scrollback from the previous terminal is lost.
- SSH config files (`~/.ssh/config`) are not read; only `ssh-config.json` is used.

## License

MIT. See [LICENSE](LICENSE).
