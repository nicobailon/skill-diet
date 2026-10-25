---
name: skill-diet
description: Put an agent skill on a diet, cutting always-loaded tokens without changing what agents do with it. Use when a skill is large, loads detail most tasks never use, or has drifted from the tool it teaches.
---

# Skill Diet

Most of a skill's weight is detail only some runs need, rules the model already follows, and lists that one idea could replace. The diet keeps in context only what the agent needs before it acts, and moves the rest to where it arrives on a **need-to-know** basis.

## The ladder

Put each fact on the lowest rung that still reaches the agent before it needs it.

| Rung | Holds | Loaded |
| --- | --- | --- |
| `description` | one trigger per case | every session |
| `SKILL.md` | what every run needs | when the skill fires |
| `references/` | what only some runs need, behind a pointer | when its case applies |

A skill that teaches a tool gets two more rungs below these: the tool's own lookup, then its error messages. A skill whose output gets checked (a renderer, a linter, tests) has the checker as its lowest rung. Weigh that rung by what one failure costs: a cheap error can replace a rule, but when one failure costs a whole cycle (a render that returns images), keep the rule inline and let the checker be a safety net.

## Process

### 1. Baseline

Copy the skill aside as the **before** version. Measure tokens for the `description`, `SKILL.md` and each reference file. Then measure the **typical-run load**: `SKILL.md` plus the references most runs read, from session logs or the eval, and any text a plugin or extension adds to every session.

List every consumer of each file: skills that link it, code that embeds it, tests that assert its text. Flag any file over the host's read limit (Pi: 50KB); its tail never arrives.

Ask the owner which hosts and setups they still use; sections for dropped ones go.

**Done when** the numbers and consumers are recorded.

### 2. Branch on tools

If the skill teaches an agent to call a tool (a CLI, API, SDK, MCP server, native tool, or a script the skill ships), read [tool-skills.md](references/tool-skills.md) now and do its steps before step 3.

**Done when** the tool steps are finished, or the skill teaches no tool.

### 3. Place

Sort every piece by the runs that need it. What every run needs stays in `SKILL.md`, including a reference that most runs end up reading. What only some runs reach moves to `references/`, behind a pointer that names its case. Scripts, templates and assets are run or copied, never read into context. Keep each meaning in one place.

**Done when** every piece sits on a rung and no meaning appears twice.

### 4. Write

- Name each rule with a short phrase the model already understands (a **tight** loop, **Own a session**), so the name carries most of the rule.
- Where a standard the model already knows covers many rules, name it and say how far to follow it ("about 80% of the way to ASD-STE100").
- Replace a list of cases with the one idea that produces them.
- One positive test replaces a list of don'ts. Keep a prohibition only for a safety rule with no positive form.
- Keep two or three inline safety lines for each risky area (writes, data leaving the machine, paid quota), even when its details move out.
- Delete any line the model already obeys.
- End `SKILL.md` with one pointer list, one line per case: `case → where to look`.
- Trim the `description` to one trigger per distinct case.

**Done when** every line changes behavior or is needed before the agent acts.

### 5. Verify

- **Tokens**: before and after, per rung.
- **Behavior**: observed before/after runs, per [eval.md](references/eval.md).
- **Rules**: a fresh reviewer confirms each behavior rule in **before** still has a home; the eval covers only your tasks.
- **Links**: `node scripts/eval.mjs links <skill-dir>` passes.

Ship when the slim skill matches or beats the old one on task success. When it misses, the logs show where the agent went wrong: move the missing piece up a rung before adding prose back.

**Done when** the eval passes. Report tokens per rung before and after, the eval table, and what moved to which rung.

## After the diet

Fold anything this run showed was wrong, missing or slow in these steps into this skill with [skill-update](../skill-update/SKILL.md). Mechanical fixes go in `scripts/`.
