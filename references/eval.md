# Before/after eval

## Versions

**before**, **after**, and **none** (no skill). A task **none** passes marks rules the model follows anyway; their lines can go.

## Tasks

10–15 one-line requests sampled from real session logs, pointed at a fixture, each with its expected outcome. Cover every case in the `SKILL.md` link list, one task per removed "don't" rule, and each risky area.

Run them in a fresh sandbox. Give each version its own skill directory and turn off context files (`AGENTS.md`, `CLAUDE.md`). Flags that disable skills may miss skills bundled in a package, so confirm each setup by asking a cheap model to list its skills. Send sub-work to the cheapest model; for a task that touches a real account, score what the agent writes instead of running it.

## Measuring

`eval.mjs run <dir> --agent <name>` (or `--cmd '<template>'` for an agent without a preset) runs every version and `score <dir>` scores them; `--help` gives the presets and task format. Run 2 tasks first to check the scorer. Read every failing output before touching the skill: the scorer is usually wrong (a `must` that accepts one valid shape rejects another). Fix the task and rescore. Score every call in a run, not just the first; rules about waiting or stopping show up later. Give each task a `check` command that asserts the end state.

For quality results (a page, a diagram, prose), score with the skill's own checker and have a fresh session judge each before/after pair blind, in random order.

Run each task 3 times per version, same model, fresh session each time. Repeat on a smaller model to see whether the slim skill helps or hurts weaker models.
