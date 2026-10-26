# Full diet

Rewrite a whole skill onto [the levels](../SKILL.md#levels), then prove agents do at least as well with it.

## 1. Baseline

Copy the skill aside as **before**. Record tokens for the `description`, `SKILL.md`, each reference, and what a typical task loads (from logs or the eval), plus any text a plugin adds to every session.

List every consumer: skills that link it, code that embeds it, tests that assert its text (point them at the whole folder), and tool descriptions or prompts that name the skill. Confirm the host loads this copy and every name resolves to it. Flag any file over the host's read limit (Pi: 50KB); its tail never arrives. Ask the owner which hosts they still use; sections for dropped ones go.

## 2. Tools

If the skill teaches a tool (CLI, API, SDK, MCP server, native tool, or a script it ships), do [tool-skills.md](tool-skills.md) before step 3.

## 3. Place

Sort every piece onto a level. A reference most tasks read belongs in `SKILL.md`. Scripts, templates and assets are run or copied, never read.

## 4. Cut and write

Cut:

- what the model already knows: definitions, standard notation, common practice, examples of an obvious idea;
- what only a human needs: motivation, history, measurements. It goes in the README or the commit message;
- every word a sentence can lose without changing what the agent does.

Write:

- Name each rule with a short phrase the model already understands, like **Edit, don't append**.
- Where a known standard covers many rules, name it and how far to follow it ("about 80% of the way to ASD-STE100").
- Replace a list of cases with the idea that produces them, and a list of don'ts with one positive test. Keep a prohibition only for a safety rule with no positive form.
- Keep two or three safety lines inline for each risky area (writes, data leaving the machine, paid quota).
- End `SKILL.md` with one line per case: `case → where to look`.

**Done when** every line changes what the agent does, and no meaning appears twice.

## 5. Verify

- **Behavior**: before/after runs, per [eval.md](eval.md).
- **Rules and facts**: a fresh reviewer confirms each rule in **before** still has a home and checks each claim in **after** against the source.
- `node ~/.pi/agent/skills/skill-diet/scripts/eval.mjs check <skill-dir>` passes.

Ship when the slim skill matches or beats the old one. On a miss, the logs show what the agent lacked: move that piece up a level before adding prose back. Record the new size with `check <skill-dir> --baseline`, and report tokens per level before and after, the eval table, and what moved where.

## After the diet

Fold anything this run showed was wrong, missing or slow into this skill, following [Editing a skill](../SKILL.md#editing-a-skill).
