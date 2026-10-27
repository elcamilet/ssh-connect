# AGENTS.md

## Repo shape

- VS Code extension with `extension.js` as the activation/UI glue and pure logic in `lib/`.
- `lib/config.js` parses/validates `ssh-config.json`, resolves host defaults and terminal labels.
- `lib/ssh.js` builds SSH argument arrays and terminal invocations. It never builds a shell command string.
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
- Manual verification is limited to activation/UI, plus a one-off Windows identity-file connection in 0.2.0. Do not claim that `sshpass`, stored passwords or macOS were validated live.
- VSIX artifacts are gitignored.

## Runtime architecture

- Activation: view `sshHostsView` plus commands `ssh-connect.editConfig`, `.savePassword`, `.deletePassword`. `ssh-connect.connectHost` is only invoked by tree items.
- Config is `<context.globalStorageUri>/ssh-config.json` (Linux stable VS Code: `~/.config/Code/User/globalStorage/elcamilet.ssh-connect/ssh-config.json`).
- The tree refreshes only when that exact file is saved.
- Invalid config keeps the last valid tree and shows an error with an "Open configuration" action.
- Legacy `defaultShell`, `host.shell` and `group.shell` are ignored with a one-time warning. There is no shell customization.
- Defaults: `host.user` → `group.defaultUser` → `root`; `host.port` → `group.defaultPort` → `22`; `host.identityFile` → `group.defaultIdentityFile`; password group is `host.group || group.name`.
- `useGroupPassword` / `useIdentityFile` are `"yes"`/`"no"` strings; booleans are also accepted. Only `"no"` disables.
- Keep-alive defaults: `ConnectTimeout=10`, `ServerAliveInterval=30`, `ServerAliveCountMax=3`. Retry is opt-in (`enabled: false`, 3 attempts, 5s delay) and only triggers on SSH exit code `255`.
- Terminal label defaults to `{user}@{host}`; `terminalName` supports `{name}`, `{user}`, `{host}` and `{port}`.
- Terminal creation runs `ssh` or `sshpass` directly. Never use `cmd.exe -c` or an intermediate shell.
- `sshpass` uses `-e` with `SSHPASS` in the terminal environment; the password must never appear in `shellArgs` or logs.
- On Windows, saved passwords are not injected: use key/agent or the OpenSSH prompt. `ssh.exe` is resolved from `%SystemRoot%\System32\OpenSSH\ssh.exe` first, then PATH.
- If `sshpass` is missing on Linux/macOS, connect with plain `ssh` and warn.
- Passwords are keyed as `ssh-connect.password.host.<user>@<host>:<port>` and `ssh-connect.password.group.<group>`.
- Passwords saved by 0.1.x via `keytar` are not migrated.

## Support and quality constraints

- Official support: Linux/WSL x86-64 and ARM64.
- Windows: best-effort. Identity-file authentication was manually verified in 0.2.0; stored passwords are not injected.
- macOS: best-effort, not validated live.
- 0.2.0 has unit tests only; no CI, integration tests or Docker SSH. Live verification is limited to the manual Windows identity-file test.
- README/CHANGELOG must state these limitations honestly.
- Keep VS Code API usage compatible with `engines.vscode: ^1.96.0`.
- `npm audit` reports a high-severity advisory inside the `@vscode/vsce` dev toolchain (Azure auth). Runtime dependencies are clean (`npm audit --omit=dev`).
