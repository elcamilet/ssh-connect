# SSH Connect by elCamilet

**SSH Connect** is a Visual Studio Code extension that lets you manage and connect to SSH servers, local WSL distributions and local terminals directly from the editor. It provides a hierarchical view of groups and hosts, quick connections in an editor terminal, and optional password storage using VS Code's SecretStorage.

## Features

- **Hierarchical SSH hosts view** grouped by category.
- **Quick connections** from the tree, using the system OpenSSH client.
- **Local terminals** on Windows, Linux and macOS, without an SSH server.
- **Local WSL terminals** on Windows, without an SSH server.
- **Configuration file** stored in VS Code global storage.
- **Saved passwords** in VS Code SecretStorage (no native keychain module).
- **Password fallback per group** for hosts that do not have their own password.
- **Configurable terminal labels** with placeholders.
- **SSH agent forwarding** per host/group.
- **Keep-alive and optional reconnection** with configurable retries.
- **Refresh on save** when the configuration file changes.

## Requirements

- VS Code `1.96.0` or newer.
- An OpenSSH client (`ssh`) available in `PATH` for SSH hosts. WSL entries use `wsl.exe` from Windows and the current shell in Remote-WSL; local entries use the VS Code terminal profile.
- `sshpass` is optional and only used for saved passwords on Linux/macOS. If it is missing, SSH Connect opens a normal `ssh` session and asks for the password in the terminal.
- WSL entries from a local Windows window require Windows 10/11 with WSL installed and `wsl.exe` available. In a Remote-WSL window they use the current distro and shell.
- Local entries require a local VS Code window. Remote-SSH, Remote-WSL and container windows reject them.
- Windows and macOS support is **best-effort** in 0.4.2.
- Linux and WSL x86-64 and ARM64 are the officially supported platforms.

`sshpass` is not used on Windows. Windows connections use an SSH key/agent or the interactive OpenSSH password prompt.

## Installation

Search for **SSH Connect** in the VS Code Marketplace, or install it with the full extension ID:

```bash
code --install-extension elcamilet.ssh-connect
```

## Usage

1. Open the **SSH Connect** view in the activity bar.
2. Click an SSH host to open an SSH connection in an editor-area terminal.
3. From a local Windows or Remote-WSL window, click a WSL entry to open the distribution from Windows or the current WSL shell. In a local window, a local entry opens the local shell.
4. Use **Edit configuration file** from the view title or the command palette to edit `ssh-config.json`.
5. Use **Save password for group or host** from the view title, the command palette, or the context menu of a host/group.
6. Use **Delete saved password for group or host** from the same locations.

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

The file is created automatically with a small example if it does not exist. In a local window, the generated file includes a `Local` group with a `Local terminal` entry. In a local window on Windows, it also includes a `WSL` entry. A remote window does not add the `Local` group.

### Example

```json
{
  "groups": [
    {
      "name": "Local",
      "hosts": [
        {
          "type": "local",
          "name": "Local terminal"
        },
        {
          "type": "wsl",
          "name": "WSL"
        }
      ]
    },
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

Group defaults apply to SSH hosts only. WSL and local entries use their own fields.

### Host fields

| Field | Description |
|---|---|
| `type` | `"ssh"`, `"wsl"` or `"local"`. Optional; defaults to `"ssh"`. |
| `host` | Hostname or IP address. Required for SSH hosts. Ignored for WSL and local hosts. |
| `name` | Visible name. Required. |
| `user` | SSH user. For WSL hosts, the Linux user. Ignored for local hosts. |
| `port` | SSH only. SSH port. Overrides `defaultPort`. |
| `identityFile` | SSH only. Identity file. Overrides `defaultIdentityFile`. |
| `group` | Optional group name used for the SSH group password lookup. WSL uses it as a display group; local entries ignore it. |
| `useGroupPassword` | SSH only. `"yes"` or `"no"`. Defaults to `"yes"`. |
| `useIdentityFile` | SSH only. `"yes"` or `"no"`. Defaults to `"yes"`. |
| `terminalName` | Terminal label. Supports `{name}`, `{user}`, `{host}`, `{port}` and `{distribution}`. Defaults to `{user}@{host}`; WSL and local default to `{name}`. Local expands only `{name}`; WSL expands `{name}`, `{user}` and `{distribution}`. |
| `distribution` | WSL only. Distribution name. Defaults to the default WSL distribution. |
| `startingDirectory` | WSL or local. WSL: absolute Linux path or `~`. Local: absolute path. Defaults to the Linux home (WSL) or the VS Code terminal default (local). |
| `shell` | Local only. Explicit shell executable. Empty uses the VS Code default profile. |
| `shellArgs` | Local only. Array of strings passed to `shell`. Requires `shell`; required when `startCommand` is set. The last value must be the shell flag that runs the command. |
| `startCommand` | SSH, WSL or local. Command to run after connecting. Local requires `shell` and a non-empty `shellArgs`. |
| `forwardAgent` | SSH only. `"yes"` or `"no"`. Overrides the group setting. |
| `connectTimeout` | SSH only. Overrides the group value. |
| `serverAliveInterval` | SSH only. Overrides the group value. |
| `serverAliveCountMax` | SSH only. Overrides the group value. |
| `retry` | SSH only. Overrides the group retry configuration. |

`useGroupPassword` and `useIdentityFile` also accept booleans.

### WSL hosts

On Windows, a host entry with `"type": "wsl"` opens a terminal inside a local WSL distribution without an SSH server:

```json
{
  "type": "wsl",
  "name": "WSL"
}
```

This uses the default distribution, the default Linux user and the home directory.

Optional fields:

```json
{
  "type": "wsl",
  "name": "Ubuntu",
  "distribution": "Ubuntu-22.04",
  "user": "devuser",
  "startingDirectory": "/home/devuser/projects/app",
  "startCommand": "opencode"
}
```

- `distribution`: omit it to use the default WSL distribution.
- `user`: omit it to use the distribution's default user.
- `startingDirectory`: absolute Linux path or `~`. Omit it for the home directory.
- `startCommand`: runs with `bash -lic` after `--cd`. The distribution must have `bash`.
- `host`, `port`, `identityFile`, `useGroupPassword`, `useIdentityFile`, `forwardAgent`, keep-alive and `retry` do not apply to WSL entries.

From a local Windows window, a WSL entry launches the selected distribution with `wsl.exe`. In a Remote-WSL window, it opens a terminal in the current distribution with the default shell (`bash`/`zsh`). `distribution` and `user` are only honored from Windows; a mismatch shows a warning and the current window is used. `startCommand` runs with `bash -lic` in both cases. On native Linux/macOS and Remote-SSH/container windows, the entry shows an error.

### Local terminals

On any platform, a host entry with `"type": "local"` opens a terminal with the VS Code default profile:

```json
{
  "type": "local",
  "name": "Local terminal"
}
```

This uses the profile selected by `terminal.integrated.defaultProfile.*` (usually PowerShell on Windows and `$SHELL` on Linux/macOS). It opens in the VS Code default terminal directory, usually the workspace root.

Optional fields:

```json
{
  "type": "local",
  "name": "PowerShell",
  "startingDirectory": "C:\\projects\\app",
  "shell": "powershell.exe",
  "shellArgs": ["-NoExit", "-Command"],
  "startCommand": "opencode"
}
```

- `startingDirectory`: absolute path for the current platform. `~` is not expanded.
- `shell`: explicit shell. Without it, the default profile is used.
- `shellArgs`: array of strings. The last value must be the flag that runs the next argument: `-Command` for PowerShell, `/K` or `/C` for cmd, `-c` or `-lic` for bash.
- `startCommand`: requires `shell` and a non-empty `shellArgs`. The extension appends it as the last argument.
- Local entries do not use passwords, group passwords or retry.
- The extension redacts `startCommand` from its output channel. `shellArgs`, `name`, `shell` and `terminalName` are logged or shown in clear; do not put secrets in them.
- VS Code resolves `${...}` variables in `shellArgs` before it starts the shell. Do not put secrets in `startCommand` or `shellArgs`.
- If `startCommand` is set and the last `shellArgs` value is not a known command flag, SSH Connect shows a warning: a wrong flag can make the shell read the command as a script file.

Examples for each shell:

```json
{
  "type": "local",
  "name": "PowerShell",
  "shell": "powershell.exe",
  "shellArgs": ["-NoExit", "-Command"],
  "startCommand": "opencode"
}
```

```json
{
  "type": "local",
  "name": "cmd",
  "shell": "cmd.exe",
  "shellArgs": ["/K"],
  "startCommand": "opencode"
}
```

```json
{
  "type": "local",
  "name": "bash",
  "shell": "bash",
  "shellArgs": ["-lic"],
  "startCommand": "opencode"
}
```

Local entries only work in a local Windows, Linux or macOS VS Code window. In Remote-SSH, Remote-WSL or container windows, the entry shows an error. This avoids the internal `workbench.action.terminal.newLocal` command, which has a documented remote-to-local execution risk (CVE-2024-49049).

### Start commands

`startCommand` is available for SSH, WSL and local hosts. It runs after the connection is established. It is configured per host; a group-level `startCommand` is ignored with a warning.

- SSH: `ssh -t user@host "startCommand"`. The command runs in the remote shell with a TTY.
- WSL: `wsl.exe ... --exec bash -lic "startCommand"` from Windows; in a Remote-WSL window, `bash -lic "startCommand"` in the current distro.
- Local: `shell`, then `shellArgs`, then the command. Local hosts require both `shell` and a non-empty `shellArgs`.

Examples:

```json
{
  "host": "10.0.0.5",
  "name": "App",
  "startCommand": "cd /srv/app && exec bash -l"
}
```

```json
{
  "type": "wsl",
  "name": "Ubuntu",
  "startCommand": "opencode"
}
```

```json
{
  "type": "local",
  "name": "PowerShell",
  "shell": "powershell.exe",
  "shellArgs": ["-NoExit", "-Command"],
  "startCommand": "opencode"
}
```

SSH Connect forwards the string as-is. It does not quote or expand it; the remote shell (SSH), `bash` (WSL) or the local shell interprets it. VS Code resolves `${...}` in `shellArgs` before launch. The extension redacts `startCommand` from its output channel; `shellArgs` and the labels are not redacted.

### Retry configuration

```json
{
  "enabled": false,
  "maxAttempts": 3,
  "delaySeconds": 5
}
```

Retries are opt-in. SSH Connect only retries exit code `255` (connection failure), up to `maxAttempts` total attempts, with a delay between attempts. Closing the terminal manually does not trigger a retry. Attempts and exit codes are logged in the **SSH Connect** output channel.

With `startCommand`, exit code `255` can also come from the remote command instead of the SSH connection. Retry remains opt-in. Local and WSL entries never retry.

The terminal scrollback of a closed terminal is not preserved.

## Passwords

Passwords are stored in VS Code SecretStorage, never in `ssh-config.json`.

- Host password key: `user@host:port`.
- Group password key: group name.
- The host password is tried first, then the group password when `useGroupPassword` is not `"no"`.
- Passwords saved by version 0.1.x using `keytar` are not migrated. Re-enter them once after upgrading.

`ssh-config.json` is plain text. On POSIX, SSH Connect creates a new file with mode `0600`. Do not store secrets in `startCommand`, `shellArgs`, `name` or `terminalName`.

On Windows, saved passwords are not injected into the SSH command. Use an SSH key/agent or type the password at the OpenSSH prompt. WSL and local entries do not use saved passwords.

`sshpass` passes the password through the `SSHPASS` environment variable instead of the command line. Prefer SSH keys or an agent when possible.

## Shortcuts and context menu

- **Host context menu:** save/delete the host password for SSH hosts.
- **Group context menu:** save/delete the group password for groups with SSH hosts.
- **View title and command palette:** choose a host/group from a quick pick.

## Troubleshooting

### The view is empty after upgrading

Check the **SSH Connect** output channel and the error notification. If `ssh-config.json` is invalid, the extension keeps the last valid tree and offers **Open configuration**.

### Custom shell settings no longer work

Custom shells for SSH hosts were removed in 0.2.0. `defaultShell`, root-level `shell` and `group.shell` are ignored with a one-time warning. `host.shell` is supported only for local entries; SSH and WSL entries ignore it.

### Saved passwords are not used on Linux/WSL

Install `sshpass`:

```bash
sudo apt install sshpass
```

If it is not installed, SSH Connect still opens the connection and lets OpenSSH ask for the password.

### WSL: extension does not activate

SSH Connect no longer uses `keytar` or `libsecret`. If you still see an activation error, open the **SSH Connect** output channel and the Extension Host log, and report the error with the VS Code version.

### Windows: `ssh` was not found

Install the OpenSSH Client optional feature or ensure `ssh.exe` is in `PATH`. SSH Connect checks `%SystemRoot%\System32\OpenSSH\ssh.exe` first.

### WSL: `wsl.exe` was not found

Install WSL or enable the Windows Subsystem for Linux optional feature, then verify that `wsl.exe` is available. A local Windows WSL entry needs `wsl.exe`; a Remote-WSL entry uses the current distro shell.

### WSL: `startCommand` fails with `command not found`

The WSL `startCommand` runs with `bash -lic` inside the distribution. Install `bash` in the distribution or use a command that is available in its login shell.

### Local: the entry shows an error in a remote window

Local entries only work in a local VS Code window. Open the folder in a local window, or use the SSH or WSL entries in the remote window.

### Local: the shell or start command fails

The local entry uses the VS Code default profile unless `shell` is set. If `startCommand` is set, `shell` and `shellArgs` are required, and the last `shellArgs` value must be the flag that runs the command (`-Command`, `/K`, `-c` or `-lic`). The extension does not infer this flag. If the last flag is not a known command flag, SSH Connect shows a warning.

`shell` must be a name in `PATH` or an absolute path. Flags belong in `shellArgs`, not in `shell`. If the shell does not exist, VS Code shows its own launch error. VS Code also resolves `${...}` variables in `shellArgs`; do not put secrets in `startCommand` or `shellArgs`.

## Limitations in 0.4.2

- Unit tests only; no CI and no real SSH, WSL or local terminal UI tests were run for this release.
- Password authentication via `sshpass` is best-effort and has not been validated live.
- Windows and macOS are best-effort.
- WSL entries from a local Windows window are best-effort and have not been validated against a live WSL installation. Remote-WSL entries are unit-tested with a `vscode` stub; no live Remote-WSL window was opened.
- Local terminal creation is unit-tested. The VS Code terminal UI and the remote-window error were not validated live. The Remote-WSL shell path is also covered by the extension stub, not by a live Remote-WSL window.
- `startCommand` in WSL requires `bash` inside the distribution.
- The last local `shellArgs` value is not rejected when it is not a known command flag; an unknown flag produces a warning and can make the shell read the command as a script file.
- The extension does not pre-check that a local `shell` exists; VS Code reports the launch error.
- Only `startCommand` is redacted from the extension output channel. `shellArgs` and the labels are not redacted.
- VS Code resolves `${...}` variables in `shellArgs` before launch.
- Reconnection creates a new terminal; scrollback from the previous terminal is lost.
- SSH config files (`~/.ssh/config`) are not read; only `ssh-config.json` is used.

## License

MIT. See [LICENSE](LICENSE).
