---
name: model-gap
description: Find why a skill works worse on one model than another, and fix it without hurting the others. Give it the skill and the models to compare.
disable-model-invocation: true
---

# Model gap

A skill tested on one model (the **reference**) often passes fewer tasks on another (the **target**). Find where and why, fix it with text every model reads, and prove the target gains while no model drops.

This runs skill-diet's eval: tasks and scoring per [eval.md](../skill-diet/references/eval.md), the adapter per [adapter.md](../skill-diet/references/adapter.md), commands as `node ../skill-diet/scripts/eval.mjs …`. Edits follow skill-diet's [Editing a skill](../skill-diet/SKILL.md#editing-a-skill).

## Set up

- **One adapter, one host** for every model, so only the model differs. Pass `--model` to every `run` and `score`.
- **Tasks** per eval.md, each labeled with the case it covers. Split them blind and at random: about a third, at least one per case, go to a **held-back** folder whose `adapter` and `sk/` link to the tuning folder's. Held-back tasks get no runs until the end.
- **Versions:** `base` (the skill as it is), `none`, and one folder per candidate fix.
- **Models:** the reference has the best `base` pass rate (on a tie, the one that reads the skill most); every other model with a gap is a target. Add at least one more model as a harm check.
- **Paid quota:** before each step, give the user sessions × cost per run and stay within the budget they set. Two tasks first measure the cost.

## 1. Measure the gap

`base` and `none` on every model, tuning tasks, 3 runs. `score <dir> --models <all> --versions none,base` puts the models side by side; `--model <m>` instead gives one model's warnings. A gap is a task the target fails more often than the reference with a cause in its logs; 2/3 against 3/3 alone is noise. If the target does better with `none` (MISS or WORSE here), look for lines to cut first. No gap on any target → stop and report.

## 2. Find the cause

**Loading first.** Compare how many runs read `SKILL.md` on each model (the `--models` table's last row; `score`'s under-half warning is this finding). If the target opens the skill much less often, fix loading before any rule: a description that says when to read the skill and what it adds to the tool's own description. If reads rise but passes don't, move the rules the target breaks into the description.

Otherwise a fresh reviewer reads each failing target run beside a passing reference run of the same task, and labels one cause with quoted evidence:

- skipped, misread or found no rule for the case in the skill it loaded → reword or widen the rule, or move it up a level;
- stopped early or asked the user → one line on what done means, unless the task really needs a question;
- tool, fixture or adapter (wrong parameter, tool error, missing file, dropped output) → fix it there, not in the skill;
- can't do it (fails even with the reference's steps written into the prompt) → drop it from the target's goal and report it;
- valid but scored wrong → eval.md's scorer check; fix the task and rerun it in every version on every model.

Each cause needs a held-back task that hits it (the same command or call). Write any that are missing now, before any fix, so step 4 can show a gain.

## 3. Fix one change at a time

Try a shared fix first: plainer, positive, more direct wording helps every model. Each candidate is a version `L<n>`: `base` plus one change.

1. **Helps the target:** `base` vs `L<n>` on the target, the gap tasks it's for, 6 runs. Keep it if the gain `score <dir> --model <target> --versions base,L<n> --tasks <those tasks>` prints is larger than its 2 SE, or a task flips from failing every run to passing every run.
2. **Hurts no one:** all kept changes as `tuned`, vs `base` on every other model, all tuning tasks, 3 runs. On WORSE or MISS, leave one change out at a time to find it, then drop or reword it. Compare reads too: a model that stops opening the skill loses the rules left in its body, so report the drop.
3. **Still helps together:** `tuned` vs `base` on the target, all tuning tasks.

Every model reads every line; a host can't reliably hide a line by model.

## 4. Held-back, once

`base` vs `tuned` on every model, held-back folder, 9 runs. Ship when the target gains more than 2 SE, no model is WORSE or MISSes, and `SKILL.md` stays within skill-diet's budget. Report tokens/run per model as a cost: a skill that models now open costs its size on every task. If `base` already passes the target's held-back tasks, they can't show a gain: add tasks for the gap's causes and run once more. If `base` fails them and `tuned` doesn't gain, the fixes are overfit; write new held-back tasks before tuning again.

## Afterward

On ship, record every model as eval.md's [Tested with](../skill-diet/references/eval.md#tested-with) says. The commit message names which change came from which target, with the measurements. When a target in `tested-with` is replaced, rerun `base` with and without its changes on the new model, and delete what no longer helps.
