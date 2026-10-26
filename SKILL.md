---
name: skill-diet
description: Keep agent skills lean and correct. Use before editing an existing skill, such as adding a lesson; when a code change touches names or behavior a skill describes; and to put a skill on a full diet when it is large, loads detail most tasks never use, or has drifted from the tool it teaches.
---

# Skill Diet

Every line in `SKILL.md` is read on every use of the skill, and skills only grow unless someone cuts.

## Levels

Put each fact on the lowest level that still reaches the agent before it needs it.

| Level | Holds | Loaded |
| --- | --- | --- |
| `description` | one trigger per case | every session |
| `SKILL.md` | what every task needs | when the skill is used |
| `references/` | what only some tasks need, behind a link that says when to read it | when that case comes up |

A skill that teaches a tool has two more levels below these: the tool's own help, then its replies and errors. Exact names, fields and values live there, not in the skill. If something checks the skill's output (a linter, tests, a renderer), that check can replace a rule when a wrong guess is cheap. When one mistake costs a whole slow cycle (a render that returns images), keep the rule in the skill too.

## Editing a skill

Before adding, go down this list and stop at the first step that handles the change.

1. **Fix it below the skill.** A mechanical mistake (a wrong name, an ignored flag, a malformed call) gets a clearer error message, a check, or a test in the tool. Prose is for judgment calls.
2. **Check the model needs it.** If an agent without the new line already does the right thing, add nothing.
3. **Edit, don't append.** Find the line that already covers the idea and change it. Each meaning lives in one place across `SKILL.md`, references, and the tool's docs.
4. **Pick its level.**
5. **Write the rule, not the story.** One positive rule under a short name. The incident behind it goes in the commit message.

**When the code changes**, update the skill in the same change whenever a name it uses (command, flag, field, default, path, error text) or a behavior its rules rely on changes. Search the skill for each changed name: fix renamed or removed names, rewrite rules whose behavior changed, and index new public operations by name only unless agents will call them often. Run the skill's coverage check; if it has none and this drift could recur, add one.

**Budget:** count `SKILL.md` tokens before and after, and put both numbers in the commit message. Offset growth with a cut where you can. `node ~/.pi/agent/skills/skill-diet/scripts/eval.mjs check <skill-dir>` checks links and fails when `SKILL.md` is over 10% larger than at its last diet; then, or when the same idea appears in two places, do a full diet instead of patching.

**Verify:** re-run the case that prompted the change with the edited skill, and run any tests that assert the skill's text.

## Look up the rest

- Full diet of a large, bloated or drifted skill → [references/diet.md](references/diet.md)
