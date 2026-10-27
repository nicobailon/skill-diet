# Before/after eval

## Versions

**before**, **after**, and **none** (no skill). A task **none** passes marks rules the model follows anyway; their lines can go.

## Tasks

10–15 one-line requests sampled from real session logs, including any case the user names or just used the skill for, each pointed at a fixture with its expected outcome. Cover every case in the `SKILL.md` link list, one task per "don't" rule, and each risky area.

Send sub-work to the cheapest model; for a task that touches a real account, score what the agent writes instead of running it.

## Measuring

Write `<dir>/adapter` for the agent you test with, as [adapter.md](adapter.md) says. `eval.mjs run <dir>` checks it with three short runs, then runs every version, and `score <dir>` scores them; `--help` gives the task format. Run 2 tasks first to check the scorer. Read every failing output before touching the skill: the scorer is usually wrong (a `must` that accepts one valid shape rejects another). Before loosening a task, show just the task and the answer to a fresh session (a subagent, or the adapter with no skill), and loosen it only if that session says the answer does the job; then rescore. Any other change to a task that already has runs is a fix, so rerun it in every version. A task every version fails can go, along with its runs. Score every call in a run, not just the first; rules about waiting or stopping show up later. Give each task a `check` command that asserts the end state.

For quality results (a page, a diagram, prose), score with the skill's own checker and have a fresh session judge each before/after pair blind, in random order.

Run each task 3 times per version, same model, fresh session each time.
