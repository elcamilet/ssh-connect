# Local Terminal Entries Spec

## TL;DR

SSH Connect can open a terminal on the local machine without an SSH connection.
A host entry with `"type": "local"` opens the terminal profile that VS Code
already uses by default. The entry can name an explicit shell, pass shell
arguments and run a start command. A start command requires an explicit shell and
the shell argument that runs it; the default profile alone cannot run one. Local
entries work only in a local VS Code window. In a remote window they show an
error. They do not use stored passwords.

| | |
| --- | --- |
| Status | Approved |
| Branch | `feat/local-terminal` |
| Date | 2026-11-27 |
| Revision | 2 - apply spec review RT1-RT10 |

## Summary

Add a third connection type, `local`, next to `ssh` and `wsl`. A local host
opens an editor terminal with the VS Code default terminal profile. An optional
`shell` and `shellArgs` replace the profile. `startCommand` is allowed only when
`shell` and a non-empty `shellArgs` are set. Local hosts do not use SSH,
passwords, group password lookup or retry.

## Goals

- Open the local default terminal profile from the SSH Connect tree.
- Allow an explicit shell and start command for local entries.
- Keep SSH and WSL behavior unchanged.
- Reject local entries in remote windows with a clear error.
- Generate a local example only in local-window installations.

## Domain language

| Term | Definition | Code | UI (en) | Avoid |
| --- | --- | --- | --- | --- |
| host entry | One object in `groups[].hosts[]` that opens a session. | `host` | host | connection |
| connection type | The kind of session of a host entry. | `type` (`"ssh"`, `"wsl"`, `"local"`) | Type | kind |
| SSH host | A host entry with `type: "ssh"` or no type. | `kind: 'ssh'` | SSH host | remote host |
| WSL host | A host entry with `type: "wsl"`. | `kind: 'wsl'` | WSL host | Linux host |
| local host | A host entry with `type: "local"`. | `kind: 'local'` | Local terminal | local connection, local SSH |
| local terminal | The editor terminal created by a local host on the machine that runs the VS Code window. | `openConnection` local branch | Local terminal | local session |
| default profile | The VS Code terminal profile selected by `terminal.integrated.defaultProfile.*`. | default profile | Default profile | default shell |
| shell | The executable that replaces the default profile. | `shell` | Shell | terminal, profile |
| shell arguments | Arguments passed to `shell` before `startCommand`. | `shellArgs` | Shell arguments | command, flags |
| starting directory | The working directory of a local terminal. | `startingDirectory` | Starting directory | cwd, workdir |
| start command | The optional command appended after `shellArgs`. | `startCommand` | Start command | startup script |
| group | A visible container of host entries. | `group`, `groups[]` | group | folder |

A local host has no lifecycle. It opens a terminal and the terminal closes when
the user closes it or the shell exits. It has no password or retry state.

## Architecture

```text
lib/config.js              ~ validate local, resolve kind, default config
lib/local.js               + buildLocalInvocation(connection)
lib/ssh.js                 ~ unchanged for SSH and WSL
extension.js               ~ local branch, tree item, password and retry skips
test/unit/config.test.js   ~ local validation and resolution
test/unit/local.test.js    + local invocation tests
test/unit/package.test.js  ~ 0.4.0
README.md                  ~ local terminal documentation
AGENTS.md                  ~ local terminal architecture
CHANGELOG.md               ~ 0.4.0
docs/decisions/            + local type ADR and index
package.json               ~ 0.4.0
package-lock.json          ~ 0.4.0
.vscodeignore              ~ exclude docs and scratchpad from the VSIX
```

No dependencies, environment variables or data model changes.

### Interface

Local host fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"local"` |
| `name` | yes | Visible name |
| `terminalName` | no | Defaults to `{name}` |
| `startingDirectory` | no | Absolute local path used as `cwd` |
| `shell` | no | Explicit shell executable; empty means default profile |
| `shellArgs` | no | Array of strings passed to `shell` |
| `startCommand` | no | Appended after `shellArgs` |

Rules:

- Without `shell`, the terminal uses the VS Code default profile.
- With `shell` and no `shellArgs`, the terminal runs the shell with no arguments.
- With `startCommand`, both `shell` and a non-empty `shellArgs` are required.
- With `startCommand`, the invocation is `shell`, then `shellArgs`, then the
  command as one final argument.
- The last `shellArgs` value must be the shell flag that runs the next argument:
  `-Command` for PowerShell, `/K` or `/C` for cmd, `-c` or `-lic` for bash.
  The extension does not infer or validate this flag.
- Without `startCommand`, the invocation is `shell` and `shellArgs` only.

Examples:

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

```json
{
  "type": "local",
  "name": "Terminal local"
}
```

## Business rules

### Connection dispatch

```text
openConnection(connection)
  ├─ kind: local → remote window? error : create local editor terminal
  ├─ kind: wsl   → wsl.exe
  └─ kind: ssh   → password lookup → ssh or sshpass
```

### Local terminal

1. A local host without `shell` opens the VS Code default profile.
2. A local host with `shell` uses that executable and `shellArgs` (empty when
   omitted).
3. A local host with `startCommand` requires `shell` and a non-empty
   `shellArgs`. The command is appended as the last argument. The extension does
   not quote, split, interpolate or infer the command flag. If the last
   `shellArgs` value is not a known command flag, it adds a warning.
4. `startingDirectory` is passed as the terminal `cwd`. It must be an absolute
   path for the current platform. The extension does not expand `~`.
5. A local host is rejected in a remote window: `vscode.env.remoteName` is set.
   The rejection avoids the `workbench.action.terminal.newLocal` command, which
   is an internal command with a documented remote-to-local execution risk
   (CVE-2024-49049). The item stays visible and the click shows an error.
6. Local hosts skip password lookup, group password lookup and retry.
7. The close listener returns early for a local host and never reads
   `connection.retry`.
8. SSH-only and WSL-only fields on a local host produce a warning and are
   ignored without validation. `shell` and `shellArgs` are valid only for local
   hosts.
9. `host.shell` is no longer a legacy field. The legacy warning stays for
   `defaultShell`, group-level `shell` and root-level `shell`.

### Tree and configuration

1. A local item uses `name` as label, `Local · default profile` or
   `Local · <shell basename>` as description, the `device-desktop` icon and the
   `localHost` context value. The tooltip shows the shell, shell arguments,
   starting directory and start command when set.
2. Only SSH hosts are password targets. A group with no SSH hosts has no group
   password action.
3. The generated configuration adds a `Local` group only when the window is
   local. The group contains `Local terminal` first and, on Windows, `WSL`
   second. A remote-window installation keeps the SSH groups and does not add a
   `Local` group.

## Accepted risks

- A local `startCommand` runs with the user's privileges. `ssh-config.json` is
  local and user-controlled; the extension forwards the command as one argument
  and does not interpret it. Verified by the `buildLocalInvocation` tests, which
  assert that the command is the last argument and that `logArgs` redacts it.
- A local host in a remote window is rejected. The item stays visible and the
  error names the local-window restriction. Verified by AC-09.
- The last shell argument is not inferred. A wrong flag can make the shell read
  the command as a script file from the current directory. The parser adds a
  warning when the last `shellArgs` value is not a known command flag. The
  README gives one example per shell.

## Acceptance criteria

### Configuration

**AC-01 Local host without shell**
- **Given** a host entry with `type: "local"` and `name: "Terminal local"`
- **When** the configuration is parsed
- **Then** it is valid and resolves to `kind: "local"` with empty `shell`,
  `shellArgs` and `startCommand`, and no retry value

**AC-02 Start command requires an explicit shell**
- **Given** a local host with `startCommand` and no `shell` or empty `shellArgs`
- **When** the configuration is parsed
- **Then** parsing fails with an error that names `shell` and `shellArgs`

**AC-03 Shell arguments require a shell**
- **Given** a local host with `shellArgs` and no `shell`
- **When** the configuration is parsed
- **Then** parsing fails with an error that names `shell`

**AC-04 Shell arguments are strings**
- **Given** a local host with `shellArgs` that is not an array of strings
- **When** the configuration is parsed
- **Then** parsing fails with an error that names `shellArgs`

**AC-05 Fields from other types**
- **Given** a local host with `host`, `port`, `user`, `identityFile`, `group`,
  `useGroupPassword`, `useIdentityFile`, `forwardAgent`, keep-alive, `retry` or
  `distribution`
- **When** the configuration is parsed
- **Then** it is valid and the warning names the ignored fields

**AC-06 Relative starting directory**
- **Given** a local host with a relative `startingDirectory`
- **When** the configuration is parsed
- **Then** parsing fails with an error that names `startingDirectory`

**AC-07 Local shell is not legacy**
- **Given** a local host with `shell`
- **When** the configuration is parsed
- **Then** the legacy custom-shell warning is not present

### Terminal

**AC-08 Default profile**
- **Given** a local host without `shell`
- **When** the user opens it in a local window
- **Then** the terminal is created in the editor area with no `shellPath` and
  the VS Code default profile is used

**AC-09 Remote window**
- **Given** a local host in a Remote-SSH, Remote-WSL or container window
- **When** the user opens it
- **Then** no terminal is created and an error says that local terminals are
  only available in local windows

**AC-10 Explicit shell**
- **Given** a local host with `shell` and `shellArgs`
- **When** the user opens it in a local window
- **Then** the terminal uses that `shellPath` and those `shellArgs`

**AC-11 Start command**
- **Given** a local host with `shell`, `shellArgs` and `startCommand`
- **When** the user opens it in a local window
- **Then** the terminal uses the shell, the shell arguments and the start command
  as the last argument

**AC-12 Starting directory**
- **Given** a local host with an absolute `startingDirectory`
- **When** the user opens it in a local window
- **Then** the terminal uses that path as `cwd`

**AC-13 No SSH features**
- **Given** a local host
- **When** the user opens the password picker or the terminal closes
- **Then** the local host is not offered as a password target, no retry is
  scheduled, and the close listener does not read `connection.retry`

### Tree and generated configuration

**AC-14 Tree item**
- **Given** a local host without `shell`
- **When** the tree renders in a local window
- **Then** the label is the name, the description says `Local · default profile`,
  the icon is the local terminal icon, and the tooltip contains the starting
  directory and start command when set

**AC-15 Group password**
- **Given** a group with only local or WSL hosts
- **When** the user opens the password picker
- **Then** the group is not offered as a password target

**AC-16 Generated configuration**
- **Given** a new installation in a local window
- **When** `ssh-config.json` is created
- **Then** it contains a `Local` group with a `Local terminal` entry on every
  platform, plus a `WSL` entry on Windows, with the local entry first

**AC-17 Remote generated configuration**
- **Given** a new installation in a remote window
- **When** `ssh-config.json` is created
- **Then** it does not contain a `Local` group

**AC-18 Existing behavior**
- **Given** an existing SSH or WSL configuration
- **When** the extension loads it
- **Then** the tree, connection invocation, passwords and retry behavior are
  unchanged

## Testing

| Criterion | Layer | Test |
| --- | --- | --- |
| AC-01 to AC-07 | Unit | `test/unit/config.test.js` |
| AC-08 to AC-12 | Unit and manual | `test/unit/local.test.js`, `test/unit/extension.test.js`; manual terminal check |
| AC-13, AC-15 | Unit | `test/unit/extension.test.js` |
| AC-14 | Manual | VS Code tree render |
| AC-16, AC-17 | Unit | `test/unit/config.test.js` |
| AC-18 | Unit | Existing SSH/WSL tests |

The terminal creation, tree item render and remote-window error still need a
manual check in a real VS Code window. `extension.test.js` uses a `vscode` stub
for the remote guard, password targets, close listener and generated config. The
unit tests cover the pure config and invocation logic.

## Documentation

- `README.md`: local hosts, fields, examples, remote window restriction.
- `AGENTS.md`: local type, default profile, shell and start command rules.
- `CHANGELOG.md`: 0.4.0.
- `docs/decisions/0001-local-terminal-type.md`: the new type and the default
  profile decision.

## Out of scope

- Opening a truly local terminal from a remote window with
  `workbench.action.terminal.newLocal`.
- Inferring the shell command flag. An unknown last `shellArgs` value produces a
  warning, not an error.
- Expanding `~` in `startingDirectory`.
- A picker for installed shells or VS Code terminal profiles.
- `startCommand` without an explicit shell.
- Passwords and retry for local hosts.
- Browser acceptance testing.
