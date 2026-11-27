# 0001 Local terminal type

- **Date**: 2026-11-27
- **Status**: Accepted
- **Type**: Irreversible
- **Source**: plan G-01, interview decisions

## Context

SSH Connect already has `ssh` and `wsl` host entries. Users also need a terminal
on the local machine without an SSH connection. The configuration format is a
public contract, because users edit `ssh-config.json` by hand.

The options were:

- a new `type: "local"` entry;
- an SSH entry with `host: "localhost"` and an `sshd` inside the operating
  system, which requires an SSH server and does not work without one;
- a separate command outside the tree, which does not fit the configuration or
  the tree.

The default shell could be the VS Code terminal profile or an explicit shell.
A start command needs a known shell; the default profile does not expose one.

## Decision

Add `type: "local"` to `groups[].hosts[]`. A local entry opens the VS Code
default terminal profile unless `shell` is set. `shellArgs` is an array of
strings. `startCommand` requires `shell` and a non-empty `shellArgs`; the command
is appended as the last argument. Local entries work only in local windows and
skip passwords and retry.

## Consequences

- The configuration format now has three connection types. Removing or renaming
  `local` later breaks existing user configurations.
- A local entry without an explicit shell follows the VS Code default profile.
  This is the least surprising default and keeps shell customization opt-in.
- A start command needs `shell` and the command flag in `shellArgs`. The
  configuration is more verbose, and a wrong flag fails inside the shell.
- Remote windows reject local entries. The extension does not use the internal
  `workbench.action.terminal.newLocal` command.
- `startingDirectory` does not expand `~`; the user must write an absolute path.
