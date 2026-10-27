# Changelog

## [Unreleased]

First versioned release.

- **Put a skill on a diet.** The agent measures what the skill loads, moves each fact to the lowest level that still reaches the agent in time, cuts what the model already knows and what only a human needs, and keeps the slim version only if agents do at least as well with it.
- **Keep it lean afterward.** Rules for every later update stop new lessons and code changes from bringing the bloat back, and a skill that grows more than 10% past its last diet gets another.
- **Skills that teach a tool** get extra steps: the calls agents make most from your session logs, mismatches between the skill and the tool proved one by one, and a check that warns when the skill drifts from the tool.
- **Before/after evals** run the same tasks with the old skill, the new one and no skill, on any coding agent. Your agent writes a small adapter for itself, and three short calibration runs check it before every eval.
- **Runs on its own.** The eval's tasks are written before anything is cut, a fresh session settles disputed answers without knowing which version wrote them, and the scorer fails the diet when the slim skill lost a task the old one always passed or most runs never opened the skill.
- **Skills only you start** are marked user-only, so their description no longer loads in every session.
- **Install** with `pi install`, the Claude Code plugin, or `npx skills add` for Codex, Cursor and other agents.
