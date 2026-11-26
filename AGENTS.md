# AGENTS.md

## Repo shape

- VS Code extension with `extension.js` as the activation/UI glue and pure logic in `lib/`.
- `lib/config.js` parses/validates `ssh-config.json`, resolves host defaults, builds the default config and formats terminal labels.
- `lib/ssh.js` builds SSH/WSL argument arrays and terminal invocations. It never builds a shell command string. The only exception is a user-provided `startCommand`, which is forwarded as an opaque string.
- `lib/passwords.js` wraps VS Code `SecretStorage` (`context.secrets`).
- `lib/retry.js` contains the retry policy.
- Unit tests live in `test/unit/` and use Node's built-in test runner. There are no integration tests, no CI and no automated live SSH tests.
- There is no build step. `package.json` `main` points directly at `extension.js`.

## Commands

```bash
npm install
npm run lint
npm test
npm run check        # lint + unit tests
npm run package      # vsce package; prepublish runs check
```

- F5 with "Run Extension" (`.vscode/launch.json`) opens an Extension Development Host.
- Manual verification is limited to activation/UI, plus a one-off Windows identity-file connection in 0.2.0. WSL entries in 0.3.0 have unit tests only and have not been validated against a live WSL installation. Do not claim that `sshpass`, stored passwords, macOS or WSL were validated live.
- VSIX artifacts are gitignored.

## Runtime architecture

- Activation: view `sshHostsView` plus commands `ssh-connect.editConfig`, `.savePassword`, `.deletePassword`. `ssh-connect.connectHost` is only invoked by tree items.
- Config is `<context.globalStorageUri>/ssh-config.json` (Linux stable VS Code: `~/.config/Code/User/globalStorage/elcamilet.ssh-connect/ssh-config.json`).
- The tree refreshes only when that exact file is saved.
- Invalid config keeps the last valid tree and shows an error with an "Open configuration" action.
- Legacy `defaultShell`, `host.shell` and `group.shell` are ignored with a one-time warning. There is no shell customization.
- Defaults: `host.user` → `group.defaultUser` → `root`; `host.port` → `group.defaultPort` → `22`; `host.identityFile` → `group.defaultIdentityFile`; password group is `host.group || group.name`.
- `useGroupPassword` / `useIdentityFile` are `"yes"`/`"no"` strings; booleans are also accepted. Only `"no"` disables.
- Keep-alive defaults: `ConnectTimeout=10`, `ServerAliveInterval=30`, `ServerAliveCountMax=3`. Retry is opt-in (`enabled: false`, 3 attempts, 5s delay) and only triggers on SSH exit code `255`. With `startCommand`, exit code `255` can also come from the remote command.
- Terminal label defaults to `{user}@{host}`; `terminalName` supports `{name}`, `{user}`, `{host}`, `{port}` and `{distribution}`. WSL defaults to `{name}`.
- WSL entries use `type: "wsl"`; `host` is not required. Group SSH defaults do not apply to them. They launch `wsl.exe` with `--distribution`, `--user`, `--cd` and optionally `--exec bash -lic <startCommand>`.
- WSL entries are Windows-only. `wsl.exe` is resolved from `%SystemRoot%\System32\wsl.exe` first, then PATH. They skip password lookup and retry.
- `startCommand` is supported on SSH and WSL hosts and is configured per host. A group-level `startCommand` is ignored with a warning. SSH adds `-t` and appends the command after `user@host`; WSL forwards it to `bash -lic`. The extension does not quote or interpolate it. It is redacted from the output channel.
- Terminal creation runs `ssh`, `sshpass` or `wsl.exe` directly. Never use `cmd.exe -c` or an intermediate shell.
- `sshpass` uses `-e` with `SSHPASS` in the terminal environment; the password must never appear in `shellArgs` or logs.
- On Windows, saved passwords are not injected: use key/agent or the OpenSSH prompt. `ssh.exe` is resolved from `%SystemRoot%\System32\OpenSSH\ssh.exe` first, then PATH.
- If `sshpass` is missing on Linux/macOS, connect with plain `ssh` and warn.
- Passwords are keyed as `ssh-connect.password.host.<user>@<host>:<port>` and `ssh-connect.password.group.<group>`.
- Passwords saved by 0.1.x via `keytar` are not migrated.

## Support and quality constraints

- Official support: Linux/WSL x86-64 and ARM64.
- Windows: best-effort. Identity-file authentication was manually verified in 0.2.0; stored passwords are not injected. WSL entries are Windows-only and have not been validated live.
- macOS: best-effort, not validated live.
- 0.3.0 has unit tests only; no CI, integration tests or Docker SSH. Live verification is limited to the manual Windows identity-file test.
- README/CHANGELOG must state these limitations honestly.
- Keep VS Code API usage compatible with `engines.vscode: ^1.96.0`.
- `npm audit` reports a high-severity advisory inside the `@vscode/vsce` dev toolchain (Azure auth). Runtime dependencies are clean (`npm audit --omit=dev`).
