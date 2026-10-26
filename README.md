# skill-diet

**An agent skill that keeps other skills lean and correct.**

An agent reads a skill's whole `SKILL.md` every time it uses the skill. Most skills carry far more than a task needs: detail only some tasks use, rules the model already follows, and lists one idea could replace. Skills that teach a tool (a CLI, an API, an SDK, an MCP server) also copy the tool's reference, and that copy goes stale as the tool changes.

The skill for Surf, a CLI that lets agents drive your browser, loaded 10,614 tokens into every browser task. It showed 3 commands that fail and 7 flags that do nothing, and left out about 15 commands that work. After a diet it loads 2,070 tokens, and agents passed 30 of 30 test tasks with it, against 15 of 15 with the old one.

skill-diet does two jobs:

- **Put a skill on a diet.** It rewrites the skill, fixes what no longer matches the tool, and keeps the slim version only if agents do at least as well with it.
- **Keep it lean afterward.** It gives agents rules for every later update, so new lessons and code changes don't bring the bloat back.

Ask your agent:

```
> put the surf skill on a diet
> is this skill still accurate for the current CLI?
> add this lesson to the surf skill
```

## How it works

Each fact goes on the lowest level that still reaches the agent before it needs it:

| Level | Holds | Read |
| --- | --- | --- |
| the skill's description | one trigger per case | in every session |
| `SKILL.md` | what every task needs | when the skill is used |
| reference files | what only some tasks need | when that case comes up |
| the tool's own help | flags, allowed values, examples | when the agent picks that command |
| errors and checkers | the right name, the fix | when a guess is wrong |

### A diet

1. Measure the skill and what a typical task loads.
2. If the skill teaches a tool, do the extra steps below.
3. Place each piece on a level.
4. Rewrite it tighter.
5. Run agents on the same tasks with the old and new versions, and keep the new one only if it does at least as well.

For a skill that teaches a tool, the diet also:

- proves each mismatch between skill and tool, by running it or pointing to the source line;
- reads your session logs to find the commands agents actually use, and spells out only those in full;
- checks that the tool's help and errors are good enough to replace skill text, and lists fixes where they aren't;
- trims a tool's schema to the fields agents use, when the tool is yours, since the schema is sent with every request;
- leaves a check that warns after a commit when the skill no longer matches the tool.

Commands are written as plain usage lines, the way the agent types them, because that is the cheapest format. The same 131 Surf commands, names and flags only:

| Format | Tokens |
| --- | --- |
| usage lines | 1,734 |
| TypeScript types | 2,718 |
| JSON Schema | 4,863 |
| OpenAPI | 8,160 |

### Every later update

Before an agent adds to a skill, it stops at the first step that handles the change:

1. Fix the tool instead, with a clearer error or a check, when that catches the mistake.
2. Add nothing the model already does without being told.
3. Change the line that already covers the idea instead of adding a new one.
4. Put the new rule on the lowest level that reaches the agent in time.

When code changes a name or behavior a skill describes, the skill is updated in the same change. Once a skill grows about 10% past its last diet, it is due for another.

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
├── SKILL.md              the levels and the rules for every update
├── references/           read only when needed
│   ├── diet.md           the five steps of a diet
│   ├── tool-skills.md    extra steps for skills that teach a tool
│   ├── formats.md        how to write commands compactly, with measured costs
│   └── eval.md           the before/after test
└── scripts/
    ├── observe.mjs       logs each call an agent makes to a CLI, for the test
    └── eval.mjs          runs and scores the before/after test; counts a tool's calls, errors and skill reads in session logs; checks links and growth since the last diet
```

## Limitations

- The before/after test runs real agent sessions, so it costs time and tokens. Run it before you ship a slimmer version, not after every update.
- The test runner uses Pi. On other agents, run the same tasks by hand; the link and growth check works anywhere.
- Command counts from session logs are approximate: a shell command that only mentions a tool's name counts too.
- The call logger wraps command-line tools. For native tools, MCP servers, APIs and SDKs, calls are read from the session log instead.
- Each skill's size at its last diet is stored per user in `~/.local/state/skill-diet/baselines.json`, never in a repo. A new machine starts with no baseline, so the growth check passes until the next diet records one.

## Credits

The writing rules build on Matt Pocock's [writing-for-agents](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents) skill.
