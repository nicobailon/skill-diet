# Tool skills

Extra work for a skill that teaches an agent to call a tool. Most of such a skill is a copy of the tool's own reference, loaded in full and drifting from the tool with each release. The diet lets the tool supply that reference itself.

An **operation** is one callable thing: a CLI command, a native or MCP tool call, an API endpoint, an SDK function. Its **parameters** are its flags, arguments or fields. Each kind of tool has its own sources:

| Tool | Public surface | Lookup | Wrong-guess signal | Freshness trigger |
| --- | --- | --- | --- | --- |
| CLI | `--help`, command registry | `<tool> <command> --help` | its error for an unknown command or flag | post-commit hook in its repo |
| native tool | its schema, already in the agent's context | a describe or guide call | its validation error | post-commit hook in its repo, or when it updates |
| MCP server | `tools/list` | its schemas, or a gateway's search and describe | its validation error | when the server's version changes |
| HTTP API | OpenAPI or GraphQL schema | the spec entry for one operation | the 4xx error body | when the spec's version changes |
| SDK | exported type declarations | the declaration for one function | a type or runtime error | when the package's version changes |

The lookup and the wrong-guess signal are two more rungs below `references/`. The lookup is loaded when the agent picks that operation; the wrong-guess signal arrives when a guess is wrong.

`SKILL.md` keeps three tool parts next to its rules:

- **Cheat sheet**: the hot operations, one full call line each.
- **Hard shapes**: one example per call shape a model gets wrong from a grammar (JSON payloads, pipe syntax, repeatable `key=value`).
- **Index**: every other public operation, names only, grouped. The agent can only look up what it knows exists.

## Steps before Place

### T1. Inventory

List the public surface from the tool itself, leaving out internal operations agents shouldn't learn. Find every copy of the tool's docs: the skill, the README, LLM-context dumps, help topics, copies installed for other agents.

**Done when** you have the public operation list and every doc copy, each with its source.

### T2. Drift

Measure the cost of each lookup (one operation's entry versus a whole group page). List the **drift**: names the tool rejects, parameters it accepts and ignores, public operations the skill never mentions, documented behavior that is broken in the tool itself. Prove each item by calling it or citing the source line; a matching name says nothing about an ignored parameter.

**Done when** every lookup cost is measured and every drift item has proof.

### T3. Hot path

Count real calls in session logs (see Logging calls). The operations covering about 90% of calls form the cheat sheet. Without logs, take the operations that every task in the skill's purpose needs.

**Done when** the cheat sheet list names its source.

### T4. Gate the tool

A lookup replaces skill text only once it works. Check that:

- every public operation has a lookup entry;
- one lookup covers one decision (about 100–300 tokens), not a whole group;
- an unknown operation name returns the closest valid ones;
- an unknown parameter is reported, not ignored;
- common failures say how to fix them.

If you control the tool, each gap becomes a change that lands before the skill relies on it. Until then, or for a tool you don't control, that material stays in the skill.

**Done when** each check passes, has a filed fix, or is covered in the skill.

## When writing

- Cheat sheet and hard shapes go in the syntax the agent uses to call the tool, with allowed values and defaults inline. [formats.md](formats.md) has the notation and the measured cost of each format.
- Leave out what the agent already sees: a native or MCP tool's schema is in its context.
- In rules and prose, point to the lookup instead of copying a value the tool can print (thresholds, model lists, presets).

## When verifying

- **Coverage**: every name in the skill resolves in the tool, every public operation is named in the skill, and every parameter and allowed value in the cheat sheet appears in the tool's surface. Zero misses.
- **Eval**: add a **none** version (no skill, only the tool's own lookups) to show what the skill adds at all. Run every version against the same tool version, with whichever T4 fixes have landed. Weight tasks by the hot path, and give every hard shape a task. Add these columns: valid first call, wrong guesses, lookup KB.
- **Misses**: the logs name the operation that was guessed wrong. Promote it to the cheat sheet or hard shapes, or improve the tool's error.
- **Keep it fresh**: save the coverage check as a script that reads one dump of the public surface. Run it on demand, and on the freshness trigger for the tool's kind. It only warns: silent while the skill holds, and naming the stale lines when it doesn't.

## Logging calls

**CLI**: put the observe shim first on `PATH`. It logs every call and passes input and output through unchanged:

```bash
mkdir -p /tmp/diet/bin
printf '#!/bin/sh\nOBSERVE_REAL=%s exec node %s "$@"\n' "$(command -v <tool>)" ~/.pi/agent/skills/skill-diet/scripts/observe.mjs > /tmp/diet/bin/<tool>
chmod +x /tmp/diet/bin/<tool>
PATH=/tmp/diet/bin:$PATH OBSERVE_LOG=/tmp/diet/calls.jsonl OBSERVE_TAGS="version=after task=7 run=2" <agent command>
```

Each call becomes one JSON line with a kind:

- `lookup`: `--help`, `-h`, `--help-full`, `--help-topic` or `--find`. Override with `OBSERVE_LOOKUP` (a regex matched against the joined arguments) for tools whose bare group name prints help.
- `invalid`: a nonzero exit whose first error or output line says unknown, unsupported, invalid or usage. During T4, tune `OBSERVE_INVALID` to the tool's own wrong-guess messages, so a runtime failure such as a missing socket isn't scored as a bad guess.
- `action`: everything else.

`node ~/.pi/agent/skills/skill-diet/scripts/observe.mjs --summary /tmp/diet/calls.jsonl` prints one row per version with the counts, the lookup output in KB and the valid-first-call rate.

**Native or MCP tool**: read its calls from the session log. Pi writes `"type":"toolCall"` and `"role":"toolResult"` entries with `"isError"`; Claude Code writes `tool_use` and `tool_result` with `is_error`. Count operations by the argument that picks them, such as `action`.

**API or SDK**: the calls live in the code or requests the agent writes. Count endpoint paths or function names in the session log's tool calls.

For a CLI's hot path, Pi and Claude Code both log shell calls as `"command":"…"`:

```bash
rg -o --no-filename -g '*.jsonl' '"command":"(?:[^"\\]|\\.)*?\b<tool> ([a-z][a-z0-9.-]*)' -r '$1' ~/.pi/agent/sessions ~/.claude/projects | sort | uniq -c | sort -rn | head -30
```

The counts are approximate: forked sessions repeat calls, and prose that mentions a name matches too.
