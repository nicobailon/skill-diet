<img src=".claude-plugin/icon.png" alt="" width="96">

# skill-diet

**An agent skill that keeps other skills lean and correct.**

An agent reads a skill's whole `SKILL.md` every time it uses the skill. Most skills carry far more than a task needs: detail only some tasks use, things the model already knows, notes written for people rather than agents, and lists that one idea could replace. Skills that teach a tool (a CLI, an API, an SDK, an MCP server) also copy the tool's reference, and that copy goes stale as the tool changes. Asking an agent to update a skill usually makes it longer, since agents tend to add more than they cut.

On real skills, a diet has cut 70–80% of the tokens with no drop in test results, and found commands the skill documented that no longer worked.

skill-diet does two jobs:

- **Put a skill on a diet.** It rewrites the skill, fixes what no longer matches the tool, and keeps the slim version only if agents do at least as well with it.
- **Keep it lean afterward.** It gives agents rules for every later update, so new lessons and code changes don't bring the bloat back.

Ask your agent:

```
> put the deploy skill on a diet
> is this skill still accurate for the current CLI?
> add this lesson to the deploy skill
```

## How it works

Each fact goes on the lowest level that still reaches the agent before it needs it:

| Level | Holds | Read |
| --- | --- | --- |
| the skill's description | one trigger per case | in every session |
| `SKILL.md` | what every task needs | when the skill is used |
| reference files | what only some tasks need | when that case comes up |
| the tool's own help | flags, allowed values, examples | when the agent picks that command |
| the tool's replies, errors and checkers | the right name, the fix, the next step | when the agent calls the tool, or a guess is wrong |

### A diet

1. Measure the skill and what a typical task loads.
2. If the skill teaches a tool, do the extra steps below.
3. Place each piece on a level. If only you ever start the skill, it gets marked user-only, so its description stops costing context in every session.
4. Cut what the model already knows and what only a human needs, then rewrite the rest tighter.
5. Run agents on the same tasks with the old skill, the new one, and no skill at all, and keep the new one only if it does at least as well. Your agent can do all of this unattended: tasks are written before anything is cut, a fresh session settles disputed answers without seeing which version wrote them, and the scorer fails the diet if the new skill does worse than chance would explain.

For a skill that teaches a tool, the diet also:

- proves each mismatch between skill and tool, by running it or pointing to the source line;
- reads your session logs to find the calls agents make most, and spells out only those in full;
- checks how often agents actually open the skill, and moves rules they need into the tool's replies and errors when they rarely do;
- checks that the tool's help and errors are good enough to replace skill text, and lists fixes where they aren't;
- trims a tool's schema to the fields agents use, when the tool is yours, since the schema is sent with every request;
- leaves a check that warns after a commit when the skill no longer matches the tool.

Commands are written as plain usage lines, the way the agent types them, because that is the cheapest format. For the same set of commands on a real CLI:

| Format | Tokens, relative to usage lines |
| --- | --- |
| usage lines | 1× |
| markdown table | 1.5× |
| TypeScript types | 1.6× |
| JSON Schema | 2.8× |
| OpenAPI | 4.7× |

### Every later update

Before an agent adds to a skill, it stops at the first step that handles the change:

1. Fix the tool instead, with a clearer error or a check, when that catches the mistake.
2. Add nothing the model already does without being told.
3. Change the line that already covers the idea instead of adding a new one.
4. Put the new rule on the lowest level that reaches the agent in time.
5. Write the rule, not the story behind it; the story goes in the commit message.

When code changes a name or behavior a skill describes, the skill is updated in the same change. Each commit to a skill records its size before and after, and once a skill grows about 10% past its last diet, it is due for another.

## Install

Pi:

```bash
pi install git:github.com/nicobailon/skill-diet
```

Update with `pi update --extensions`.

Claude Code:

```
/plugin install skill-diet --marketplace nicobailon/skill-diet
```

Update with `claude plugin update skill-diet@skill-diet`.

Codex, Cursor and other agents:

```bash
npx skills add nicobailon/skill-diet -g
```

This keeps one copy in `~/.agents/skills`, linked into each agent you pick. Update with `npx skills update`. Use one route per agent; installing both loads the skill twice.

To install by hand, clone the repo into `~/.agents/skills/skill-diet`, where Codex, Cursor and Pi read it, and link it into `~/.claude/skills/skill-diet` for Claude Code.

Releases and what changed in each are in [CHANGELOG.md](CHANGELOG.md).

## What's inside

```
skill-diet/
├── SKILL.md              the levels and the rules for every update
├── package.json          the version, and what lets `pi install` load the skill
├── .claude-plugin/       the Claude Code plugin and its marketplace
├── references/           read only when needed
│   ├── diet.md           the five steps of a diet
│   ├── tool-skills.md    extra steps for skills that teach a tool
│   ├── formats.md        how to write commands compactly
│   ├── eval.md           the before/after test
│   └── adapter.md        how your agent writes the script that runs it in the test
└── scripts/
    ├── observe.mjs       wraps a CLI so every call an agent makes during the test is logged
    └── eval.mjs          checks your agent's adapter, then runs and scores the before/after test; checks a skill's links and prints its size
```

### Why scripts, plus an adapter your agent writes

The test is only fair if each run sees just its own copy of the skill and every run is measured the same way. Mistakes there don't raise errors; they give numbers that look fine. So the parts that are the same for every agent ship as code, and the part that depends on your agent is written by your agent and checked before every eval:

- **Scoring is code.** Tasks, pass/fail rules, the tables and the warnings work the same for every diet and every agent. It exits with an error when the slim skill does worse than chance would explain, or when most runs never opened the skill, so an agent working alone knows not to ship.
- **Your agent writes the adapter.** It's a small script that runs one session of your agent with only one copy of the skill, and records the answer, tokens and tool calls. Your agent writes it from its own CLI's help, so it matches the version you have installed, and it lives in your eval folder, so updates don't touch it. In our tests, Claude Code and Pi each wrote one in under 4 minutes, and Codex in 7 to 16.
- **Calibration checks it.** Before every eval, three short runs must pass: the agent quotes a line only its copy of the skill holds, says it has no skill when given none (so an installed copy can't leak in), and runs a shell command. A broken adapter stops the eval instead of skewing it.
- **Your agent reads its own session logs.** Log formats change between agent releases, so any log reader we ship goes stale. Ours did: it missed calls made inside Pi's code-mode scripts and undercounted Claude Code errors by a third. Agents reading today's logs got both right.
- **Logs stay out of the agent's context.** The agent runs the scripts and reads only what they print, never the scripts or the logs:

| Job | Script reads | Agent reads |
| --- | --- | --- |
| score one diet's test (45 runs) | ~2 MB of logs | a 600-byte table |

## Limitations

- The before/after test runs real agent sessions, so it costs time and tokens. Run it before you ship a slimmer version, not after every update.
- Calibration checks that the agent is given only its copy of the skill and that tokens and tool calls are recorded. An agent with a shell can still find another copy on disk; the scorer warns when a run reads one. Calibration also can't check that token counts are exact; [adapter.md](references/adapter.md) says how to count them.
- The call logger wraps command-line tools. For native tools, MCP servers, APIs and SDKs, calls are read from the session logs instead.

## Credits

The writing rules build on Matt Pocock's [writing-for-agents](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents) skill.
