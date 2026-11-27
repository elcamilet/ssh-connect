# Local Terminal Entries Plan

## TL;DR

Add a `local` host type that opens the VS Code default terminal profile, supports
an explicit shell and a start command, then update the generated configuration
and the documentation. Each step leaves the extension usable and tested.

| | |
| --- | --- |
| Status | Approved |
| Branch | `feat/local-terminal` |
| Date | 2026-11-27 |
| Revision | 3 - merge the coupled config and shell steps after RT1 |

## Goal

Implement `docs/local-terminal-spec.md` (AC-01 to AC-18) in two commits on
`feat/local-terminal`.

## Step 1 — Local terminal capability

**Capability:** a host entry with `type: "local"` appears in the tree and opens
an editor terminal with the VS Code default profile. It can use an explicit
shell and start command. Remote windows reject it. Local entries are skipped by
passwords and retry. `shell` no longer triggers the legacy warning.

**Files:**

- `lib/config.js`: accept `"local"`; do not require `host`; validate an absolute
  `startingDirectory`, `shell`, `shellArgs` as an array of strings and the
  `startCommand` constraint; resolve `kind: "local"`; make the legacy warning
  apply only to `defaultShell`, `group.shell` and root-level `shell`; warnings
  for fields that do not apply.
- `lib/local.js`: `buildLocalInvocation(connection)` returns `command`,
  `shellPath`, `shellArgs` and redacted `logArgs`.
- `extension.js`: local branch in `openConnection`, remote-window guard,
  `openEditorTerminal` with optional `shellPath` and `cwd`, local tree item,
  password and retry skips, local close log with an early return.
- `test/unit/config.test.js`: local validation, resolution, warnings, legacy
  shell and generated configuration assertions that do not depend on the new
  default config.
- `test/unit/local.test.js`: default-profile, explicit-shell and start-command
  invocation.

**Tests:** `npm run check`. The pure tests cover config and invocation. The
terminal UI needs a manual check in a local VS Code window.

**Commit:** `feat: add local terminal entries`.

## Step 2 — Generated configuration, documentation and version

**Capability:** new local-window installations get a local example; the docs and
version describe 0.4.0.

**Files:**

- `lib/config.js`: `createDefaultConfig(platform, { isRemote })` adds a `Local`
  group with `Local terminal` first and `WSL` second (Windows) only when
  `isRemote` is false.
- `test/unit/config.test.js`: generated configuration for local Windows, local
  Linux and remote windows.
- `README.md`: local hosts, fields, examples, remote-window restriction.
- `AGENTS.md`: local type, legacy shell rule and invocation rules.
- `CHANGELOG.md`: 0.4.0.
- `docs/decisions/0001-local-terminal-type.md` and `docs/decisions/README.md`.
- `package.json`, `package-lock.json`, `test/unit/package.test.js`: 0.4.0.
- `.vscodeignore`: exclude `docs/**` and `.scratchpad/**` from the VSIX.

**Tests:** `npm run check` and `npm run package`.

**Commit:** `docs: document local terminal entries`.

## Out of scope

- Opening a local terminal from a remote window.
- Inferring or validating the shell command flag.
- Expanding `~` in `startingDirectory`.
- A picker for installed shells or terminal profiles.
- `startCommand` without an explicit shell.
- Passwords and retry for local hosts.

## Verification

- `npm run check`.
- `npm run package`.
- Manual check in a local VS Code window: default profile, explicit shell,
  start command, starting directory and remote-window error.
- `verify-against-spec` maps AC-01 to AC-18 to tests or manual checks.
