# The adapter

`<dir>/adapter` is an executable that runs one non-interactive session of the agent you test with, and records it:

    <dir>/adapter <skill-dir> <prompt> <out-dir> <work-dir>

`<skill-dir>` is the version's skill folder, or "" for the no-skill version. Use the model in `$EVAL_MODEL` (set by `run --model`). Copy the adapter from an earlier eval when you have one; otherwise write it from the agent's `--help` and the output you see when you run it, since flags and formats change between versions.

The run must be fair:
- The agent works in `<work-dir>` and sees exactly one skill: `<skill-dir>`, under its folder name, or none when it is "". Hide every installed skill, plugin, memory and user-level instruction file (AGENTS.md, CLAUDE.md, rules). Keep the user logged in without changing their real config or login files.
- It can read files and run shell commands with no prompts.
- It gets the eval's environment, including `PATH` and `OBSERVE_*`, which the call logger uses.

Write `<out-dir>/result.json`:

    {"answer": "<final reply>", "tokens": {"input": n, "output": n, "cacheRead": n, "cacheWrite": n}, "turns": n or null, "calls": [{"name": "...", "path": "...", "command": "..."}]}

- `tokens`: the session's totals as the agent reports them. `input` excludes cached tokens. Don't add reasoning tokens to `output` unless the agent counts them separately; where the agent reports a total, check that the four numbers add up to it.
- `turns`: the number of model requests (not user turns), or null when the agent doesn't report them.
- `calls`: every tool call. File reads need `path` and shell commands need `command`; other calls need only `name`. Write any path into the skill under `<skill-dir>` as given. A skill loaded by name counts as reading `<skill-dir>/SKILL.md`, or `/<name>/SKILL.md` for any other skill.

Keep the agent's raw output in `<out-dir>`. Exit 0 once `result.json` has the usage, even if the agent itself failed; exit non-zero when the output has no usage, which stops the eval. Delete anything you create outside `<out-dir>`, also when you get SIGTERM. Several runs happen at once, so runs must not share anything.

`eval.mjs calibrate <dir>` must pass before an eval, and `run` checks it again each time. Each check's output is in `<dir>/calibration/`.
