# Before/after eval

Prove the slim skill by watching agents use it next to the old one.

## Versions

- **before**: the copy saved in step 1.
- **after**: the slim skill.

## Tasks

10–15 one-line requests, each with its expected outcome, covering:

- every case in the pointer list, so each moved piece gets reached;
- one task per removed "don't" rule, to prove the positive rule covers it;
- each risky area (writes, data leaving the machine, quota).

Run them live in a fresh sandbox (a new browser profile, a scratch directory). For a task that spends paid quota or touches a real account, score what the agent writes instead of running it.

## Measuring

From each run's session log, take tokens per turn (including cached), reads of `references/` files, turn count and wall time. A small checker per task asserts the end state: the file exists, the slider moved, the issue has the label.

When the result is judged on quality rather than an end state (a page, a diagram, a piece of writing), score each output with the skill's own checker, and have a fresh session judge each before/after pair blind, in random order.

Run each task 3 times per version, with the same model and a fresh session each time. Repeating both versions on a smaller model shows whether the slim skill helps or hurts weaker models.

| version | skill tokens | tokens per task | turns | reference reads | success |
| --- | --- | --- | --- | --- | --- |
