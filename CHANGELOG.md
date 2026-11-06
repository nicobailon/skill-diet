# Changelog

## [Unreleased]

- **Fix a skill that works worse on another model.** A second skill, skill-model-gap, runs the same tasks on each model, finds why the weaker one fails, and keeps a fix only if it helps that model without hurting the others, judged on tasks held back until the end. Only you start it (`/skill:skill-model-gap` in Pi, `/skill-diet:skill-model-gap` in Claude Code), so it costs no context otherwise. In its first trial, one description change took Kimi from 78% to 98% of runs passed and Haiku from 85% to 100%, with no drop on GPT or GLM.
- **Evals across models.** Runs for each `--model` are kept apart in one eval folder, so several models can run at once; calibration fails when the host serves a different model than asked; and `score --versions a,b` compares any two versions, prints the gain with its margin of error, and fails when either has no runs. To score runs that an earlier eval made with `--model`, leave out `--model`, or move them into `runs/<model>/`.
- **See every model at once.** `score --models a,b,c` prints one table with a row per task and a column per model, each cell showing the pass count before and after the change, plus totals and how often each model opened the skill.
- **Calibration fails less for reasons that aren't the adapter's fault:** a model given no skill tries to open an installed copy that the adapter blocks, or a model refuses to quote a line marked as a canary. Calibration now copies the first version you pass to `--versions`, not the first folder by name.
- **Evals that catch hangs.** The eval guide says how to catch a hang the model recovered from, how to skip rules that can't fail on your host, and which tasks must run alone.
- **Skills record what they were tested with.** When an eval decides a ship, the skill's front matter lists every host and model it passed on and the date, so you can see whether it was tested on your model, and `check` prints the list. skill-model-gap uses it to know what to rerun when one of those models is replaced.
- **Skills that agents rarely open** get a description that says to read them before the first call of their tool.
- **New layout:** both skills now live under `skills/`. If you cloned the repo into a skills folder by hand, link `skills/skill-diet` and `skills/skill-model-gap` instead.
- **Skill managers see the version.** Each skill's front matter now lists its version and author under `metadata`, where skill managers such as asm look, and every release updates the version. Before, asm showed every install as 0.0.0 with no author. Thanks [@Qurtison](https://github.com/Qurtison) ([#23](https://github.com/nicobailon/skill-diet/pull/23)).
- **Stricter scoring.** A `must_not` rule now also fails a run when the agent actually ran the banned command, not only when it wrote it in a code block. Opening a file in a fixture folder that shares the skill's name, such as `config/deploy/`, no longer counts as reading the skill from outside the eval. And `score` fails when the two versions have different numbers of runs of a task, which happens when a run was cut short. Reported by [@tarrific](https://github.com/tarrific) in [#22](https://github.com/nicobailon/skill-diet/issues/22).

## [0.1.0] - 2026-10-27

First versioned release.

- **Put a skill on a diet.** The agent measures what the skill loads, moves each fact to the lowest level that still reaches the agent in time, cuts what the model already knows and what only a human needs, and keeps the slim version only if agents do at least as well with it.
- **Keep it lean afterward.** Rules for every later update stop new lessons and code changes from bringing the bloat back, and a skill that grows more than 10% past its last diet gets another.
- **Skills that teach a tool** get extra steps: the calls agents make most from your session logs, mismatches between the skill and the tool proved one by one, and a check that warns when the skill drifts from the tool.
- **Before/after evals** run the same tasks with the old skill, the new one and no skill, on any coding agent. Run a diet right after using the skill and that use becomes one of the tasks. Your agent writes a small adapter for itself, and three short calibration runs check it before every eval.
- **Runs unattended.** Eval tasks are written before anything is cut, a fresh session settles disputed answers without seeing which version wrote them, and the scorer fails the diet if the slim skill does worse than chance would explain, or if most runs never opened the skill.
- **Skills only you start** get marked user-only, so their description stops loading in every session.
- **Install** with `pi install`, the Claude Code plugin, or `npx skills add` for Codex, Cursor and other agents.
