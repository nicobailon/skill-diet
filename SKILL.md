---
name: skill-diet
description: Keep agent skills lean and correct. Use before editing an existing skill, such as adding a lesson; when a code change touches names or behavior a skill describes; and to put a skill on a full diet when it is large, loads detail most tasks never use, or has drifted from the tool it teaches.
---

# Skill Diet

Every line in `SKILL.md` is read on every use of the skill, and skills only grow unless someone cuts.

## The ladder

Put each fact on the lowest rung that still reaches the agent before it needs it: **need-to-know**.

| Rung | Holds | Loaded |
| --- | --- | --- |
| `description` | one trigger per case | every session |
| `SKILL.md` | what every run needs | when the skill fires |
| `references/` | what only some runs need, behind a pointer naming its case | when its case applies |

A skill that teaches a tool gets two more rungs below these: the tool's own lookup, then its errors, which hold exact fields and values. A skill whose output gets checked (a renderer, a linter, tests) has the checker as its lowest rung. A cheap error can replace a rule; when one failure costs a whole cycle (a render that returns images), keep the rule inline and let the checker be a safety net.

## Editing a skill

Before adding, go down this list and stop at the first step that handles the change.

1. **Fix it below the skill.** A mechanical mistake (a wrong name, an ignored flag, a malformed call) gets a clearer error message, a check, or a test in the tool. Prose is for judgment calls.
2. **Check the model needs it.** If an agent without the new line already does the right thing, add nothing.
3. **Edit, don't append.** Find the line that already covers the idea and change it. Each meaning lives in one place across `SKILL.md`, references, and the tool's docs.
4. **Place it on the ladder.**
5. **Write the rule, not the story.** One positive rule under a short name. The incident behind it goes in the commit message.

**When the code changes**, update the skill in the same change whenever a name it uses (command, flag, field, default, path, error text) or a behavior its rules rely on changes. Search the skill for each changed name: fix renamed or removed names, rewrite rules whose behavior changed, and index new public operations by name only unless agents will call them often. Run the skill's coverage check; if it has none and this drift could recur, add one.

**Budget:** count `SKILL.md` tokens before and after, and put both numbers in the commit message. Offset growth with a cut where you can. `node ~/.pi/agent/skills/skill-diet/scripts/eval.mjs check <skill-dir>` checks links and fails when `SKILL.md` is over 10% larger than at its last diet; then, or when the same idea appears in two places, do a full diet instead of patching.

**Verify:** re-run the case that prompted the change with the edited skill, and run any tests that assert the skill's text.

## Look up the rest

- Full diet of a large, bloated or drifted skill → [references/diet.md](references/diet.md)
