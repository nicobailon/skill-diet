# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Highlights

- **Fix a skill that works worse on another model.** The new skill-model-gap skill runs the same tasks on each model you pick, finds why the weaker one fails, and keeps a fix only if it helps that model without hurting the others. In its first trial, one change to a skill's description took Kimi from 78% to 98% of runs passed and Haiku from 85% to 100%.
- **See every model in one table.** Evals keep each model's runs apart, so you can test several at once and compare them task by task.
- **Know what a skill was tested on.** A shipped skill lists the hosts and models it passed on, and the date.
- **Fairer scoring.** Running a banned command now fails a run, and comparisons with missing runs fail instead of giving a misleading result.

### Added

- **skill-model-gap**, a second skill for fixing a skill that works worse on another model. It finds why the weaker model fails (it never opened the skill, misread a rule, hit a tool error, or the test itself was wrong) and tests one fix at a time, judged on tasks held back until the end. Only you start it (`/skill:skill-model-gap` in Pi, `/skill-diet:skill-model-gap` in Claude Code), so it costs no context otherwise.
- **Evals across models.** Each `--model` keeps its runs apart in one eval folder, so several models can run at once. `score --versions a,b` compares any two versions and prints the gain with its margin of error.
- **`score --models a,b,c`** prints one table with a row per task and a column per model. Each cell shows the pass count before and after the change, with totals and how often each model opened the skill.
- **Tested-with record.** When an eval decides to ship a skill, its front matter lists every host and model it passed on and the date, and `check` prints the list. skill-model-gap uses it to know what to rerun when one of those models is replaced.
- **Version and author in each skill's front matter**, under `metadata`, where skill managers such as asm look. Before, asm showed every install as 0.0.0 with no author. Thanks [@Qurtison](https://github.com/Qurtison) ([#23](https://github.com/nicobailon/skill-diet/pull/23)).
- **Catching hangs.** The eval guide shows how to catch a hang the model recovered from, how to skip rules that can't fail on your host, and which tasks must run alone.

### Changed

- **New layout:** both skills now live under `skills/`. If you cloned the repo into a skills folder by hand, link `skills/skill-diet` and `skills/skill-model-gap` instead.
- **Runs from an earlier `--model` eval** now belong in `runs/<model>/`. To score old ones, leave out `--model` or move them there.
- **Skills that agents rarely open** get a description telling the agent to read the skill before its first call of the tool.
- **Calibration** copies the first version you pass to `--versions`, not the first folder by name.

### Fixed

- **Banned commands count.** A `must_not` rule now fails a run when the agent actually ran the banned command, not only when it wrote it in a code block. Reported by [@tarrific](https://github.com/tarrific) in [#22](https://github.com/nicobailon/skill-diet/issues/22).
- **No false "read from outside the eval" warnings** when a fixture folder shares the skill's name, such as `config/deploy/` ([#22](https://github.com/nicobailon/skill-diet/issues/22)).
- **`score` fails instead of misleading** when one version has no runs, or when two versions have different numbers of runs of a task, which happens when a run was cut short ([#22](https://github.com/nicobailon/skill-diet/issues/22)).
- **Calibration fails for the right reasons.** It fails when the host serves a different model than asked, and no longer fails when a model given no skill tries to open an installed copy that the adapter blocks, or refuses to quote a line marked as a canary.

## [0.1.0] - 2026-10-27

First versioned release.

- **Put a skill on a diet.** The agent measures what the skill loads, moves each fact to the lowest level that still reaches the agent in time, cuts what the model already knows and what only a human needs, and keeps the slim version only if agents do at least as well with it.
- **Keep it lean afterward.** Rules for every later update stop new lessons and code changes from bringing the bloat back, and a skill that grows more than 10% past its last diet gets another.
- **Skills that teach a tool** get extra steps: the calls agents make most from your session logs, mismatches between the skill and the tool proved one by one, and a check that warns when the skill drifts from the tool.
- **Before/after evals** run the same tasks with the old skill, the new one and no skill, on any coding agent. Run a diet right after using the skill and that use becomes one of the tasks. Your agent writes a small adapter for itself, and three short calibration runs check it before every eval.
- **Runs unattended.** Eval tasks are written before anything is cut, a fresh session settles disputed answers without seeing which version wrote them, and the scorer fails the diet if the slim skill does worse than chance would explain, or if most runs never opened the skill.
- **Skills only you start** get marked user-only, so their description stops loading in every session.
- **Install** with `pi install`, the Claude Code plugin, or `npx skills add` for Codex, Cursor and other agents.
