---
name: model-gap
description: Find why a skill works worse on one model than another, and fix it without hurting the others. Give it the skill and the models to compare.
disable-model-invocation: true
---

# Model gap

A skill tested on one model (the **reference**) often passes fewer tasks on another (the **target**). Find where and why, fix it with text every model reads, and prove the target gains while no model drops.

This runs skill-diet's eval: tasks and scoring per [eval.md](../skill-diet/references/eval.md), the adapter per [adapter.md](../skill-diet/references/adapter.md), commands as `node ../skill-diet/scripts/eval.mjs …`. Edits follow skill-diet's [Editing a skill](../skill-diet/SKILL.md#editing-a-skill).

## Set up

- **One adapter, one host** for every model, so only the model differs. `run --model` keeps each model's runs apart, and calibration checks the host served that model.
- **Tasks** per eval.md, each labeled with the case it covers. Split them blind and at random: about a third, at least one per case, go to a **held-back** folder whose `adapter` and `sk/` link to the tuning folder's. Held-back tasks get no runs until the end.
- **Versions:** `base` (the skill as it is), `none`, and one folder per candidate fix.
- **Models:** the reference is the one with the best `base` pass rate. Add at least one more model as a harm check.
- **Paid quota:** before each step, give the user sessions × cost per run and stay within the budget they set. Two tasks first measure the cost.

## 1. Measure the gap

`base` and `none` on every model, tuning tasks, 3 runs. Score each model with `score <dir> --model <m> --versions none,base`. A task the target passes as often as the reference has no gap; leave it. If the target does better with `none` (MISS or WORSE here), look for lines to cut first. No gap on any target → stop and report.

## 2. Find the cause

**Loading first.** Compare how many runs read `SKILL.md` on each model (`score`'s reads line; its under-half warning is this finding). If the target opens the skill much less often, fix the description or the link line before any rule: say when to read it, and what it adds to the tool's own description.

Otherwise a fresh reviewer reads each failing target run beside a passing reference run of the same task, and labels one cause with quoted evidence:

- skipped or misread a rule it loaded → reword it, or move it up a level;
- stopped early or asked the user → one line on what done means, unless the task really needs a question;
- tool, fixture or adapter (wrong parameter, tool error, missing file, dropped output) → fix it there, not in the skill;
- can't do it (fails even with the reference's steps written into the prompt) → drop it from the target's goal and report it;
- valid but scored wrong → eval.md's scorer check; fix the task and rerun it in every version on every model.

## 3. Fix one change at a time

Try a shared fix first: plainer, positive, more direct wording helps every model. Each candidate is a version `L<n>`: `base` plus one change.

1. **Helps the target:** `base` vs `L<n>` on the target, the tasks it's for, 6 runs. Keep it if the gain `score <dir> --model <target> --versions base,L<n> --tasks <those tasks>` prints is larger than its 2 SE, or a task flips from failing every run to passing every run.
2. **Hurts no one:** all kept changes as `tuned`, vs `base` on every other model, all tuning tasks, 3 runs. On WORSE or MISS, leave one change out at a time to find it, then drop or reword it.
3. **Still helps together:** `tuned` vs `base` on the target, all tuning tasks.

Every model reads every line; a host can't reliably hide a line by model.

## 4. Held-back, once

`base` vs `tuned` on every model, held-back folder, 9 runs. Ship when the target gains more than 2 SE, no model is WORSE or MISSes, and `SKILL.md` stays within skill-diet's budget. Report tokens/run per model as a cost: a skill that models now open costs its size on every task. If the gain doesn't hold here, the fixes are overfit; write new held-back tasks before tuning again.

## Afterward

Note in the eval folder which changes came from which target, with the exact model id. When that model is replaced, rerun `base` with and without them on the new one, and delete what no longer helps. Measurements go in the commit message.
