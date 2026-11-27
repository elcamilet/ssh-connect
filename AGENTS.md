# AGENTS.md

## Repo shape

- VS Code extension with `extension.js` as the activation/UI glue and pure logic in `lib/`.
- `lib/config.js` parses/validates `ssh-config.json`, resolves host defaults, builds the default config and formats terminal labels.
- `lib/ssh.js` builds SSH/WSL argument arrays and terminal invocations. It never builds a shell command string. The only exception is a user-provided `startCommand`, which is forwarded as an opaque string.
- `lib/local.js` builds the local shell invocation and redacts the start command from the log.
- `lib/passwords.js` wraps VS Code `SecretStorage` (`context.secrets`).
- `lib/retry.js` contains the retry policy.
- Unit tests live in `test/unit/` and use Node's built-in test runner. There are no integration tests, no CI and no automated live SSH, WSL or local terminal tests.
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
- Manual verification is limited to activation/UI, plus a one-off Windows identity-file connection in 0.2.0. WSL entries in 0.3.0, local terminal entries in 0.4.0 and the Remote-WSL shell path in 0.4.2 have unit tests only and have not been validated against a live VS Code terminal. Do not claim that `sshpass`, stored passwords, macOS, WSL or the local terminal UI were validated live.
- VSIX artifacts are gitignored.

## Release

- Before you say that credentials are missing, check `gh auth status` and the
  `vscode-vsce` keyring entry for `elcamilet`.
- Merge the pull request to `master` before publishing. Do not publish a feature
  branch.
- Confirm `git status --short` is empty, run `npm run check`, then run
  `npm run package` on `master`.
- Publish the generated VSIX with
  `node node_modules/@vscode/vsce/vsce publish --packagePath ssh-connect-<version>.vsix`.
- Wait until `vsce show elcamilet.ssh-connect` reports the new version before
  saying it is live.

## Review process

- Before you launch red-team subagents, commit or stash. Do not edit source
  files until they finish; the reviewed commit must match the working tree.
- When a yak-pilot run is active, run its `check_plan.py` at each phase end and
  fix every reported problem before the next phase.

## Runtime architecture

- Activation: view `sshHostsView` plus commands `ssh-connect.editConfig`, `.savePassword`, `.deletePassword`. `ssh-connect.connectHost` is only invoked by tree items.
- Config is `<context.globalStorageUri>/ssh-config.json` (Linux stable VS Code: `~/.config/Code/User/globalStorage/elcamilet.ssh-connect/ssh-config.json`).
- The tree refreshes only when that exact file is saved.
- Invalid config keeps the last valid tree and shows an error with an "Open configuration" action.
- Legacy `defaultShell`, root-level `shell` and `group.shell` are ignored with a one-time warning. `host.shell` is supported only for local entries; SSH and WSL entries ignore it.
- Defaults: `host.user` → `group.defaultUser` → `root`; `host.port` → `group.defaultPort` → `22`; `host.identityFile` → `group.defaultIdentityFile`; password group is `host.group || group.name`. These group defaults apply to SSH hosts only.
- `useGroupPassword` / `useIdentityFile` are `"yes"`/`"no"` strings; booleans are also accepted. Only `"no"` disables.
- Keep-alive defaults: `ConnectTimeout=10`, `ServerAliveInterval=30`, `ServerAliveCountMax=3`. Retry is opt-in (`enabled: false`, 3 attempts, 5s delay) and only triggers on SSH exit code `255`. With `startCommand`, exit code `255` can also come from the remote command.
- Terminal label defaults to `{user}@{host}`; `terminalName` supports `{name}`, `{user}`, `{host}`, `{port}` and `{distribution}`. WSL and local default to `{name}`. Local expands only `{name}`; WSL expands `{name}`, `{user}` and `{distribution}`.
- WSL entries use `type: "wsl"`; `host` is not required. Group SSH defaults do not apply to them. From a local Windows window they launch `wsl.exe` with `--distribution`, `--user`, `--cd` and optionally `--exec bash -lic <startCommand>`.
- In a Remote-WSL window (`vscode.env.remoteName === 'wsl'` and a Linux extension host), a WSL entry opens a terminal in the current distro with the default shell. `startCommand` runs with `bash -lic`. The current distro comes from `WSL_DISTRO_NAME`; the current user comes from `os.userInfo().username`. Do not use the proposed `vscode.env.remoteAuthority` API.
- `distribution` and `user` overrides are only honored from a local Windows window. In Remote-WSL, a mismatch warns and the current window is used. On native Linux/macOS and Remote-SSH/container windows, a WSL entry shows an error.
- From a local Windows window, `wsl.exe` is resolved from `%SystemRoot%\System32\wsl.exe` first, then PATH. WSL entries skip password lookup and retry.
- Local entries use `type: "local"`; `host` is not required. They use the VS Code default terminal profile unless `shell` is set. `startingDirectory` is an absolute local path and maps to `cwd`. `shellArgs` is an array of strings; `startCommand` requires `shell` and a non-empty `shellArgs`. They skip password lookup and retry.
- A local `shellArgs` value that is not a known command flag produces a warning when `startCommand` is set; a wrong flag can make the shell read the command as a script file.
- Local entries work only in local windows: `vscode.env.remoteName` rejects them. The internal `workbench.action.terminal.newLocal` command is not used.
- `startCommand` is supported on SSH, WSL and local hosts and is configured per host. A group-level `startCommand` is ignored with a warning. SSH adds `-t` and appends the command after `user@host`; WSL forwards it to `bash -lic`; local appends it after `shellArgs`. The extension does not quote or interpolate it. Only `startCommand` is redacted from the output channel; `shellArgs` and labels are not. VS Code resolves `${...}` in `shellArgs` before launch.
- The generated config adds a `Local` group only in a local window. It is pure (`createDefaultConfig(platform, { isRemote })`) and never runs a shell.
- On POSIX, a new `ssh-config.json` is created with mode `0600`. It is plain text; do not store secrets in `startCommand`, `shellArgs`, `name` or `terminalName`.
- Terminal creation runs `ssh`, `sshpass`, `wsl.exe`, the VS Code default profile or an explicit local shell directly. Never use `cmd.exe -c` or an intermediate shell.
- `sshpass` uses `-e` with `SSHPASS` in the terminal environment; the password must never appear in `shellArgs` or logs.
- On Windows, saved passwords are not injected: use key/agent or the OpenSSH prompt. `ssh.exe` is resolved from `%SystemRoot%\System32\OpenSSH\ssh.exe` first, then PATH.
- If `sshpass` is missing on Linux/macOS, connect with plain `ssh` and warn.
- Passwords are keyed as `ssh-connect.password.host.<user>@<host>:<port>` and `ssh-connect.password.group.<group>`.
- Passwords saved by 0.1.x via `keytar` are not migrated.

## Support and quality constraints

- Official support: Linux/WSL x86-64 and ARM64.
- Windows: best-effort. Identity-file authentication was manually verified in 0.2.0; stored passwords are not injected. WSL entries work from a local Windows window or a Remote-WSL window and have not been validated live. Local entries work on all platforms in local windows and have not been validated live.
- macOS: best-effort, not validated live.
- 0.4.2 has unit tests only; no CI, integration tests or Docker SSH. Live verification is limited to the manual Windows identity-file test.
- README/CHANGELOG must state these limitations honestly.
- Keep VS Code API usage compatible with `engines.vscode: ^1.96.0`.
- `npm audit` reports a high-severity advisory inside the `@vscode/vsce` dev toolchain (Azure auth). Runtime dependencies are clean (`npm audit --omit=dev`).
