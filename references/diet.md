# Full diet

Rewrite a whole skill onto [the levels](../SKILL.md#levels), then prove agents do at least as well with it.

## 1. Baseline

Copy the skill aside as **before**. Record tokens for the `description`, `SKILL.md`, each reference, and what a typical task loads (from logs or the eval), plus any text a plugin adds to every session.

List every consumer: skills that link it, code that embeds it, tests that assert its text (point them at the whole folder), and tool descriptions or prompts that name the skill. Confirm the host loads this copy and every name resolves to it. Flag any file over the host's read limit (Pi: 50KB); its tail never arrives. Drop sections for a host with no sessions in the last 60 days (logs: Pi `~/.pi/agent/sessions`, Claude Code `~/.claude/projects`, Codex `${CODEX_HOME:-~/.codex}/sessions`, Cursor `~/.cursor/projects`), unless other people install the skill.

## 2. Tools

If the skill teaches a tool (CLI, API, SDK, MCP server, native tool, or a script it ships), do [tool-skills.md](tool-skills.md) before step 3.

## 3. Place

Write the eval tasks first ([eval.md](eval.md)), while **before** is the only version, so they can't be shaped around the new one.

Sort every piece onto a level. A reference most tasks read belongs in `SKILL.md`. Scripts, templates and assets are run or copied, never read.

If only the user ever starts the skill, set `disable-model-invocation: true` (Codex: `policy.allow_implicit_invocation: false` in `agents/openai.yaml`) and give it a one-line description written for them. It then costs no context until it's started.

## 4. Cut and write

Cut:

- what the model already knows: definitions, standard notation, common practice, examples of an obvious idea;
- what only a human needs: motivation, history, measurements. It goes in the README or the commit message;
- every word a sentence can lose without changing what the agent does.

Write:

- Name each rule with a short phrase the model already understands.
- Where a known standard covers many rules, name it and how far to follow it ("about 80% of the way to ASD-STE100").
- Replace a list of cases with the idea that produces them, and a list of don'ts with one positive test. Keep a prohibition only for a safety rule with no positive form.
- Keep two or three safety lines inline for each risky area (writes, data leaving the machine, paid quota), even when the model knows them.
- End `SKILL.md` with one line per case: `case → where to look`.

**Done when** every line changes what the agent does, and no meaning appears twice.

## 5. Verify

- **Behavior**: before/after runs, per [eval.md](eval.md).
- **Rules and facts**: a fresh reviewer confirms each rule in **before** still has a home or was cut under step 4, and checks each claim in **after** against the source. For anything **after** no longer says (a rule, an example, a note) that no task covers, the reviewer writes a one-line case and runs it 3 times through the adapter with **after**. The piece goes back in unless every run gets it right.
- `check <skill-dir>` passes.

Ship when `score` exits 0 and **after** either uses fewer tokens per run than **before** or fixes drift. If a MISS survives its rerun, or `score` reports WORSE, the logs show what the agent was missing: move that piece up a level before adding prose back. Report tokens per level before and after, the eval table, what moved where, what was cut, and any tool change the slim skill depends on.

## After the diet

Fold anything this run showed was wrong, missing or slow into this skill, following [Editing a skill](../SKILL.md#editing-a-skill).
