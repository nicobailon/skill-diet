# skill-diet

**An agent skill that keeps other skills lean and correct.**

Most skills load more text than a task needs, or hold stale or wrong details, and the whole file is loaded each time the skill is used. skill-diet does two things:

- **A full diet.** It rewrites a skill so the agent reads only what it needs before it acts and finds the rest when a task calls for it, fixing what no longer matches the tool. It measures the skill before and after, and keeps the slim version only if agents do at least as well with it.
- **A checklist for every edit.** Before an agent adds to a skill, it fixes the tool instead when an error message or check can catch the mistake, adds nothing the model already does, changes the line that already covers the idea instead of appending one, and puts the rule where only the runs that need it will read it. When code changes under a skill, the renamed flag or changed default goes into the skill in the same change.

```
> put the surf skill on a diet
> is this skill still accurate for the current CLI?
> add this lesson to the surf skill
```

## Why

Most of a skill's weight is detail only some tasks need, rules the model already follows, and lists that one idea could replace. Skills that teach a tool (a CLI, an API, an SDK, an MCP server) have a second problem: they copy the tool's reference, and the copy drifts as the tool changes.

Take its first case, the skill for Surf, a CLI that lets agents drive your browser. That skill loads 10.6k tokens for every browser task. It also shows 3 commands that fail and 7 flags that do nothing, and it never mentions about 15 commands that work.

## How it works

Each fact goes on the lowest level that still reaches the agent before it needs it:

| Level | Holds | Read |
| --- | --- | --- |
| the skill's description | one trigger per case | in every session |
| `SKILL.md` | what every task needs | when the skill is used |
| reference files | what only some tasks need | when that case comes up |
| the tool's own help | flags, allowed values, examples | when the agent picks that command |
| errors and checkers | the right name, the fix | when a guess is wrong |

A full diet works in five steps: measure, take extra steps if the skill teaches a tool, place each piece on a level, rewrite it tighter, and verify with before-and-after agent runs. The extra steps for a tool:

- prove each mismatch between skill and tool, by running it or pointing to the source line;
- reads your session logs to find the commands agents actually use, and gives only those a full line;
- checks that the tool's help and errors are good enough to replace skill text, and lists fixes where they aren't;
- leaves a check that warns after a commit when the skill no longer matches the tool.

Commands are written as plain usage lines, the way the agent types them. The same 131 Surf commands, names and flags only:

| Format | Tokens |
| --- | --- |
| usage lines | 1,734 |
| TypeScript types | 2,718 |
| JSON Schema | 4,863 |
| OpenAPI | 8,160 |

## Install

Copy or clone the folder into your agent's skills directory:

| Agent | Path |
| --- | --- |
| Pi | `~/.pi/agent/skills/skill-diet` |
| Claude Code | `~/.claude/skills/skill-diet` |
| Codex CLI | `~/.codex/skills/skill-diet` |
| Cursor | `~/.cursor/skills/skill-diet` |
| Other Agent Skills hosts | `~/.agents/skills/skill-diet` |

```bash
git clone https://github.com/nicobailon/skill-diet ~/.pi/agent/skills/skill-diet
```

## What's inside

```
skill-diet/
├── SKILL.md              the ladder and the edit checklist
├── references/           read only when needed
│   ├── diet.md           the five steps of a full diet
│   ├── tool-skills.md    extra steps for skills that teach a tool
│   ├── formats.md        how to write commands compactly, with measured costs
│   └── eval.md           the before/after test
└── scripts/
    ├── observe.mjs       logs each call an agent makes to a CLI, for the test
    └── eval.mjs          runs and scores the before/after test with Pi; checks links and growth since the last diet
```

## Limitations

- The before/after test runs real agent sessions, so it costs time and tokens. Run it before you ship a slim version, not after every edit.
- Command counts from session logs are approximate: forked sessions repeat calls.
- The call logger wraps command-line tools. For native tools, MCP servers, APIs and SDKs, calls are read from the session log instead.
- Each skill's size at its last diet is stored per user in `~/.local/state/skill-diet/baselines.json`, never in a repo. A new machine starts with no baseline, so the growth check passes until the next diet records one.

## Credits

The writing rules build on Matt Pocock's [writing-for-agents](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents) skill.
