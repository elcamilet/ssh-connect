# Change Log

All notable changes to the "ssh-connect" extension will be documented in this file.

## [0.2.0] - 2026-10-27

### Added

- Password storage using VS Code `SecretStorage` instead of the native `keytar` module.
- Host password key based on `user@host:port` to avoid collisions between users and ports.
- Save/delete password actions in the host and group context menus, in addition to the global command.
- Configurable terminal label with `{name}`, `{user}`, `{host}` and `{port}` placeholders. Default: `user@host`.
- SSH agent forwarding via `forwardAgent`.
- SSH keep-alive with `ServerAliveInterval` and `ServerAliveCountMax`.
- Opt-in reconnection with configurable attempts and delay.
- `SSH Connect` output channel for connection attempts, exit codes and retries.
- `ParseConfig` validation with actionable errors and preservation of the last valid tree.

### Changed

- The extension now runs `ssh`/`sshpass` directly without an intermediate shell.
- Windows connections use `ssh.exe` directly instead of `cmd.exe -c`.
- Linux/WSL x86-64 and ARM64 are the officially supported platforms. Windows and macOS are best-effort.
- The README installation command now uses the full extension ID.
- Passwords are sent to `sshpass` through `SSHPASS` (via `sshpass -e`), not through command-line arguments.
- If `sshpass` is missing, SSH Connect opens a normal `ssh` session and warns instead of blocking the connection.

### Removed

- `keytar` dependency and its native binaries.
- `ssh-config` and `fs` npm dependencies.
- Legacy `vscode` npm dev dependency.
- Custom shell support: `defaultShell`, `host.shell` and `group.shell`.
- Integration test scaffolding and the unused TypeScript migration leftovers.

### Fixed

- Extension activation on WSL/Linux systems without `libsecret`.
- Windows connection failure caused by `cmd.exe -c`.
- Silent configuration errors when `ssh-config.json` is malformed.
- Stale password keys shared by different users/ports on the same host.
- Incorrect README installation command.

### Breaking changes

- Passwords stored by 0.1.x via `keytar` are not migrated. Re-enter them once.
- `defaultShell`, `host.shell` and `group.shell` are ignored. SSH Connect uses the system OpenSSH client directly.
- The host password key changed from the hostname alone to `user@host:port`.

### Notes

- 0.2.0 has unit test coverage only. It has no CI and has not been validated against real SSH connections.
- Password authentication via `sshpass` and Windows/macOS support are best-effort.
- Reconnection does not preserve terminal scrollback; connection attempts are logged in the `SSH Connect` output channel.

## [0.1.0] - 2025-01-23

### Changed

- Change from Typescript to Javascript.

### Added

- Save passwords for individual hosts or groups.
- Delete saved passwords for individual hosts or groups.
- Hosts options on configuration file. View README.md for more details.
- New icons for commands.

### Fixed

- Fixed focus when terminal is opened.
- Refresh hosts when configuration file is saved.

### Removed

- Command to manually refresh hosts.

## [0.0.4] - 2025-01-20

### New feature

- Added support for custom shell configuration.

## [0.0.3] - 2025-01-20

### Changed

- Updated README.md with screenshots.

## [0.0.2] - 2025-01-20

### Added

- The hosts tree now refreshes when the configuration file is saved.

### Changed

- Updated icons and labels for commands.

### Fixed

- ViewsContainers is now properly implemented.
- Opening a new tab now establishes an SSH connection directly, instead of sendText to the terminal.

## [0.0.1] - 2025-01-17

- Initial release.
