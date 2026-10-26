# Tool skills

Extra work for a skill that teaches an agent to call a tool. Most of such a skill is a copy of the tool's own reference, loaded in full and drifting from the tool with each release. The diet lets the tool supply that reference itself.

An **operation** is one callable thing: a CLI command, a native or MCP tool call, an API endpoint, an SDK function. Its **parameters** are its flags, arguments or fields. Each kind of tool has its own sources:

| Tool | Public surface | Lookup |
| --- | --- | --- |
| CLI | `--help`, command registry | `<tool> <command> --help` |
| native tool | its schema, sent with every request | a describe or guide call |
| MCP server | `tools/list` | its schemas, or a gateway's search and describe |
| HTTP API | OpenAPI or GraphQL schema | the spec entry for one operation |
| SDK | exported type declarations | the declaration for one function |

`SKILL.md` keeps three tool parts next to its rules:

- **Cheat sheet**: the most-used operations, one full call line each, plus the rules models get wrong about them.
- **Hard shapes**: one example per call shape a model gets wrong from a grammar (JSON payloads, pipe syntax, repeatable `key=value`). When a shape fails on some hosts, show the working alternative next to it.
- **Index**: every other public operation, names only, grouped. The agent can only look up what it knows exists.

## Extra steps, before diet step 3

### T1. Inventory

List the public surface from the tool itself, leaving out internal operations agents shouldn't learn. Find every copy of the tool's docs: the skill, the README, LLM-context dumps, help topics, copies installed for other agents.

**Done when** you have the public operation list and every doc copy, each with its source.

### T2. Drift

Measure the cost of each lookup (one operation's entry versus a whole group page). List the **drift**: names the tool rejects, parameters it accepts and ignores, public operations the skill never mentions, documented behavior that is broken in the tool itself. Prove each item by calling it or citing the source line; a matching name says nothing about an ignored parameter. Measure how much of the skill the docs already cover by facts, not matching text: a paraphrase is still a copy.

**Done when** every lookup cost is measured and every drift item has proof.

### T3. Most-used calls

Count real calls in session logs (see Logging calls), and group error results by message: a recurring error names a missing rule or a tool error to fix. The operations covering about 90% of calls form the cheat sheet. Without logs, take the operations that every task in the skill's purpose needs. For a native or MCP tool, also count how often agents open the skill (`calls <tool> --skill <name>`); agents often call the tool without reading it.

**Done when** the cheat sheet list names its source.

### T4. Check the tool's help and errors

A lookup replaces skill text only once it works. Check that:

- every public operation has a lookup entry;
- one lookup covers one decision (about 100–300 tokens), not a whole group;
- an unknown operation name returns the closest valid ones;
- an unknown parameter is reported, not ignored;
- common failures say how to fix them.

If you control the tool, each gap becomes a change that lands before the skill relies on it. Until then, or for a tool you don't control, that material stays in the skill.

A native or MCP tool's schema is sent with every request and can cost more than the skill. If you control the tool, have the schema list only the cheat sheet's fields; the rest stay accepted, are named in the skill, and a test checks that each one is.

**Done when** each check passes, has a filed fix, or is covered in the skill.

## When writing

- Cheat sheet and hard shapes go in the syntax the agent uses to call the tool, with allowed values and defaults inline. [formats.md](formats.md) has the notation and the measured cost of each format.
- Leave out what a native or MCP tool's schema already says. Put a rule agents break with only the schema in view into the tool's replies or errors. Its description is in every session's cached prompt: put a rule there only when it must stop a call before it happens, and pin its bytes with a test so each change is deliberate.
- In rules and prose, point to the lookup instead of copying a value the tool can print (thresholds, model lists, presets).

## When verifying

- **Coverage**: every name in the skill resolves in the tool, every public operation is named in the skill, and every parameter and allowed value in the cheat sheet appears in the tool's surface. Zero misses.
- **Eval**: add a **none** version (no skill, only the tool's own lookups) to show what the skill adds at all. Run every version against the same tool version, with whichever fixes from T4 have landed.
  - For a native tool, `run` drops it, so pass `--tools read,<tool>` and `-- -e <extension>`, or a stub extension with the real schema whose `execute` runs nothing.
  - If no version reads the skill, the run measures the tool's own text; also run without the tool to see the skill once read.
  - Weight tasks by the most-used calls, and give every hard shape a task. Also report valid first calls, wrong guesses and lookup KB.
- **Misses**: the logs name the operation that was guessed wrong. Promote it to the cheat sheet or hard shapes, or improve the tool's error.
- **Keep it fresh**: save the coverage check as a script that reads one dump of the public surface. Run it on demand, after each commit to a tool you control, and when a tool you don't control changes version. It only warns: silent while the skill holds, and naming the stale lines when it doesn't.

## Logging calls

**CLI, during an eval**: `node ~/.pi/agent/skills/skill-diet/scripts/observe.mjs shim <tool>` puts a logging copy of the tool in `/tmp/diet/bin` and prints the line that runs an agent with it. Each call is logged as `lookup`, `invalid` or `action`; `observe.mjs` with no arguments explains each kind and how to tune it, and `observe.mjs --summary <log>` prints the counts, lookup KB and valid-first-call rate per version.

**CLI, from past sessions**: `node ~/.pi/agent/skills/skill-diet/scripts/eval.mjs calls <tool> --cli` counts its subcommands in Pi and Claude Code shell calls.

**Native or MCP tool**: `calls <tool> --by <key>` prints argument-key counts, the values of `<key>`, and top error messages.

**API or SDK**: the calls live in the code or requests the agent writes. Count endpoint paths or function names in the session log's tool calls.
