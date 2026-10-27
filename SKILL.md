---
name: skill-diet
description: Keep agent skills lean and correct. Use before editing an existing skill, such as adding a lesson; when a code change touches names or behavior a skill describes; and to put a skill on a full diet when it is large, loads detail most tasks never use, or has drifted from the tool it teaches.
---

# Skill Diet

## Levels

Put each fact on the lowest level that still reaches the agent before it needs it.

| Level | Holds | Loaded |
| --- | --- | --- |
| `description` | one trigger per case | every session |
| `SKILL.md` | what every task needs | when the skill is used |
| `references/` | what only some tasks need, behind a link that says when to read it | when that case comes up |

A skill that teaches a tool has two more levels: the tool's help, then its replies and errors. Exact names, fields and values live there, not in the skill. A check on the skill's output (linter, tests, renderer) can replace a rule, unless one miss costs a slow cycle.

## Editing a skill

Stop at the first step that handles the change.

1. **Fix it below the skill.** A mechanical mistake gets a clearer error, a check, or a test in the tool. Prose is for judgment calls.
2. **Check the model needs it.** If a fresh session does the right thing without the line, add nothing.
3. **Edit, don't append.** Change the line that already covers the idea. Each meaning lives in one place across `SKILL.md`, references, and the tool's docs.
4. **Pick its level.**
5. **Write the rule, not the story.** One positive rule under a short name; the incident goes in the commit message.

**When code changes** a name or behavior the skill relies on, update the skill in the same change. Index new public operations by name only, unless agents will call them often. Run the skill's coverage check, or add one if drift could recur.

**Budget:** put `SKILL.md`'s size before and after in the commit message, and offset growth with a cut. When it is over 10% larger than at its last diet commit, or one idea appears in two places, do a full diet. `node scripts/eval.mjs check <skill-dir>` prints the size and checks links.

**Verify:** rerun the case that prompted the change in a fresh session, and any tests that assert the skill's text.

## Look up the rest

- Full diet of a large, bloated or drifted skill → [references/diet.md](references/diet.md)
