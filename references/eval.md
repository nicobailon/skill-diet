# Before/after eval

Prove the slim skill by watching agents use it next to the old one.

## Versions

- **before**: the copy saved in step 1.
- **after**: the slim skill.
- **none**: no skill. A task it passes marks rules the model follows anyway; their lines can go.

## Tasks

10–15 one-line requests, sampled from real requests in session logs and pointed at a fixture, each with its expected outcome, covering:

- every case in the pointer list, so each moved piece gets reached;
- one task per removed "don't" rule, to prove the positive rule covers it;
- each risky area (writes, data leaving the machine, quota).

Run them live in a fresh sandbox (a new browser profile, a scratch directory). Give each version its own skill directory and turn off context files (`AGENTS.md`, `CLAUDE.md`); flags that disable skills may not cover skills bundled in a package, so confirm each setup by asking a cheap model to list its skills. Send sub-work to the cheapest model through the fixture's settings; for a task that touches a real account, score what the agent writes instead of running it.

## Measuring

`node ~/.pi/agent/skills/skill-diet/scripts/eval.mjs run <dir>` runs every version with Pi, and `score <dir>` prints tokens (including cached), skill file reads, turns and wall time per version, and success per task; `--help` gives the task format. Run 2 tasks once first to check the scorer. When before and after fail the same task, read the outputs before touching the skill: the scorer is usually wrong. Score every call in the run, not just the first; rules about waiting, resuming or stopping only show up later. A small checker per task (`check`) asserts the end state: the file exists, the slider moved, the issue has the label.

When the result is judged on quality rather than an end state (a page, a diagram, a piece of writing), score each output with the skill's own checker, and have a fresh session judge each before/after pair blind, in random order.

Run each task 3 times per version, with the same model and a fresh session each time. Repeating both versions on a smaller model shows whether the slim skill helps or hurts weaker models.

| version | skill tokens | tokens per task | turns | reference reads | success |
| --- | --- | --- | --- | --- | --- |
