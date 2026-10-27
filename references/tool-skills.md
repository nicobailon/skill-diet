# Tool skills

Extra steps for a skill that teaches an agent to call a tool. The tool explains itself; the skill keeps only what the tool can't.

`SKILL.md` keeps three tool parts next to its rules:

- **Cheat sheet**: the most-used operations, one full call each, plus the rules models get wrong about them.
- **Hard shapes**: one example per call shape models get wrong (JSON payloads, pipe syntax, repeatable `key=value`), with the working alternative where a shape fails on some hosts.
- **Index**: every other public operation, names only, grouped. The agent can only look up what it knows exists.

## Extra steps, before diet step 3

### T1. Inventory

List the public operations from the tool itself, minus internal ones. Find every copy of its docs: skill, README, LLM-context dumps, help topics, copies installed for other agents.

### T2. Drift

List names the tool rejects, parameters it accepts and ignores, public operations the skill never mentions, and documented behavior that is broken in the tool. Prove each by calling it or citing the source line; a matching name says nothing about an ignored parameter. Measure each help entry's size (one operation versus a whole group page) and how much of the skill the docs already cover, by facts, not matching text.

### T3. Most-used calls

Count real calls in session logs (see Logging calls) and group errors by message: a recurring error names a missing rule or a tool error to fix. The operations covering about 90% of calls form the cheat sheet. Without logs, take what every task needs, and say so. For a native or MCP tool, also count how often agents open the skill; they often call the tool without reading it.

### T4. Check the tool's help and errors

The tool's help replaces skill text only when:

- every public operation has a help entry;
- one entry covers one decision (about 100–300 tokens), not a whole group;
- an unknown operation name returns the closest valid ones;
- an unknown parameter is reported, not ignored;
- common failures say how to fix them.

If you control the tool, fix each gap before the skill relies on it; otherwise that material stays in the skill. A native or MCP tool's schema is sent with every request and can cost more than the skill: if you control it, list only the cheat sheet's fields, keep the rest accepted and named in the skill, and test that each one is.

## When writing

- Write calls in the syntax the agent types, with allowed values and defaults inline ([formats.md](formats.md)).
- Leave out what a schema already says. A rule agents break with only the schema in view goes into the tool's replies or errors. Its description is in every session's cached prompt: put a rule there only when it must stop a call before it happens, and pin its bytes with a test.
- Point to the tool's help instead of copying a value it can print (thresholds, model lists, presets).

## When verifying

- **Coverage**: every name in the skill resolves in the tool, every public operation is named, and every parameter and value in the cheat sheet exists. Zero misses. Save it as a script that warns, and run it after each commit to a tool you control, or when a tool you don't control changes version.
- **Eval**: add a **none** version with only the tool's own help. Run every version against the same tool version, with whatever T4 fixes have landed. Weight tasks by the most-used calls, give every hard shape a task, and report valid first calls, wrong guesses and help KB.
  - For a native tool, have the adapter load the tool's extension, or a stub with the real schema whose `execute` does nothing.
- **Misses**: the logs name the operation guessed wrong. Move it into the cheat sheet or hard shapes, or improve the tool's error.

## Logging calls

- **CLI, in an eval**: `observe.mjs shim <tool>` installs a logging copy and prints how to run the eval with it; `observe.mjs --summary <log>` prints counts per version. Run `observe.mjs` alone for what each call kind means.
- **Past sessions**: write a small script that reads the last 60 days of your agent's session logs ([where they live](diet.md#1-baseline)), and keep it next to the adapter for the next diet. Count calls by subcommand or argument, errors by message, and how many sessions that call the tool also read the skill. Two things trip up log readers: forked and resumed sessions repeat earlier calls (count each call id once, and treat a fork or subagent as part of its parent session), and some agents log code-mode calls inside the tool result instead of as their own entries.
- **API or SDK**: count endpoint paths or function names in the code the agent wrote, from the session log.
