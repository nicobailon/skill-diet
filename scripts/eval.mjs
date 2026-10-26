#!/usr/bin/env node
// Runs the before/after eval with a coding agent and scores it.
// Layout: <dir>/tasks.json  [{ id, prompt, must?: [regex], must_not?: [regex], setup?: "sh", check?: "sh" }]
//         <dir>/sk/<version>/<skill>/   one skill folder per version; "none" needs no folder
// Run:    node eval.mjs run <dir> [--agent pi|claude|codex|cursor | --cmd '<template>'] [--versions before,after,none] [--tasks a,b]
//                       [--runs 3] [--parallel 6] [--model <id>] [--tools read] [-- extra agent args]
//         A preset gives the agent only the version's copy of the skill and reads tokens, turns and skill
//         reads from its output. --cmd runs any other agent: {prompt} and {skill} (the version's skill folder,
//         empty for none) are replaced shell-quoted, and stdout plus stderr is the answer.
// Score:  node eval.mjs score <dir> [--detail]   also warns when a run read the skill from outside sk/<version>.
// Calls:  node eval.mjs calls <tool> [--cli] [--days 60] [--by action] [--skill <name>] [--dir <sessions>]
//         counts a native or MCP tool's calls in Pi, Claude Code, Codex CLI and Cursor CLI session logs:
//         argument keys, values of the --by keys, top error messages, and with --skill how many sessions that
//         call the tool read <name>/SKILL.md. With --cli, <tool> is a command-line tool: shell calls that run
//         it are counted by subcommand (approximate: a command that only mentions the name counts too).
//         Default dirs are ~/.pi/agent/sessions, ~/.claude/projects, ${CODEX_HOME:-~/.codex}/sessions and
//         ~/.cursor/projects. Cursor logs no tool results, so its errors are not counted. Point --dir at an
//         eval's runs/ to count wrong guesses.
// Check:  node eval.mjs check <skill-dir> [--baseline]   exits 1 on a relative link or #anchor that does not
//         resolve, or when SKILL.md is over 10% larger than its size at the last diet.
//         --baseline records the current size; run it when a diet ships. Sizes are kept per user, outside
//         every repo, in ${XDG_STATE_HOME:-~/.local/state}/skill-diet/baselines.json, keyed by the skill's name.
// Scoring removes quotes first, so `"$DIR/tool" main` matches `tool main`. `must` patterns match anywhere
// in the agent's output; `must_not` patterns match only code-block lines that are not comments, so
// "I won't run X" passes. `setup`, the agent and `check` run in a temp work dir, deleted after `check`; `check`
// must exit 0.
// Finished runs are kept, so rerunning `run` only fills in missing ones.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const [command, target, ...rest] = process.argv.slice(2);
const dash = rest.indexOf("--");
const flags = dash >= 0 ? rest.slice(0, dash) : rest;
const extra = dash >= 0 ? rest.slice(dash + 1) : [];
const opt = (name, fallback) => (flags.includes(`--${name}`) ? flags[flags.indexOf(`--${name}`) + 1] : fallback);

// A preset: command({ prompt, skill, out, work }) -> { cmd, args, env? }, where skill is the version's skill folder or null;
// parse(out, stdout, skill) -> { answer, tokens: { input, output, cacheRead, cacheWrite }, turns, calls: [{ name, path?,
// command? }] }, null where the agent doesn't report it, with paths into the skill rewritten to the skill folder;
// optional cleanup(out) after parse, notice printed when the run starts, and parallel to cap concurrent runs.
const tempHomes = new Map(); // run folder -> the temp home a preset made outside it, which the agent can't read
const removeTempHome = (out) => {
  if (tempHomes.has(out)) rmSync(tempHomes.get(out), { recursive: true, force: true });
  tempHomes.delete(out);
};
// Agents report paths through the link a preset made to the version's skill, sometimes with /tmp or /var resolved
// to /private/...; rewrite each form to the skill folder, longest first so a shorter form can't match inside one.
function toSkillPaths(skill, link) {
  if (!skill) return (s) => s;
  const aliases = [...new Set([link, join(realpathSync(dirname(link)), basename(link)), realpathSync(skill)])].sort((a, b) => b.length - a.length);
  return (s) => (s === undefined ? undefined : aliases.reduce((text, a) => text.replaceAll(a, skill), String(s)));
}
const jsonLines = (text) =>
  text.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
function skillName(folder) {
  return readFileSync(join(folder, "SKILL.md"), "utf8").match(/^name:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
}
const presets = {
  pi: {
    command: ({ prompt, skill, out }) => ({
      cmd: "pi",
      args: ["-p", "-ne", "-nc", "-ns", "-np", "--tools", opt("tools", "read"), ...(skill ? ["--skill", skill] : []), "--session-dir", join(out, "sessions"), ...(opt("model") ? ["--model", opt("model")] : []), ...extra, prompt],
    }),
    parse: (out, stdout) => {
      const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      let turns = 0;
      const calls = [];
      const sessions = join(out, "sessions");
      for (const f of existsSync(sessions) ? readdirSync(sessions).filter((f) => f.endsWith(".jsonl")) : []) {
        for (const { message: m } of jsonLines(readFileSync(join(sessions, f), "utf8"))) {
          if (m?.role !== "assistant") continue;
          turns++;
          for (const k of Object.keys(tokens)) tokens[k] += m.usage?.[k] ?? 0;
          for (const c of m.content ?? []) if (c.type === "toolCall") calls.push({ name: c.name, path: c.arguments?.path, command: c.arguments?.command });
        }
      }
      return { answer: stdout, tokens, turns, calls };
    },
  },
  claude: {
    // Project settings only, so the user's installed skills stay out; --add-dir loads skills from
    // <dir>/.claude/skills/, where the version's folder is linked.
    command: ({ prompt, skill, out }) => {
      const dirs = [];
      if (skill) {
        const root = join(out, "claude");
        mkdirSync(join(root, ".claude", "skills"), { recursive: true });
        const link = join(root, ".claude", "skills", basename(skill));
        if (!existsSync(link)) symlinkSync(skill, link);
        dirs.push("--add-dir", root);
      }
      const tools = [...new Set([...opt("tools", "read").split(",").map((t) => t[0].toUpperCase() + t.slice(1)), "Skill"])].join(",");
      return {
        cmd: "claude",
        args: ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "project", ...dirs, "--tools", tools, "--allowedTools", tools, "--permission-mode", "dontAsk", ...(opt("model") ? ["--model", opt("model")] : []), ...extra, prompt],
        env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }, // keeps runs out of ~/.claude/projects
      };
    },
    parse: (out, stdout, skill) => {
      const calls = [];
      let answer = "", turns = null, tokens = null;
      const toSkill = toSkillPaths(skill, skill && join(out, "claude", ".claude", "skills", basename(skill)));
      const name = skill && (skillName(skill) ?? basename(skill));
      for (const e of jsonLines(stdout)) {
        // Assistant events carry usage from the start of each message; the result has the final totals.
        if (e.type === "result") {
          const u = e.usage ?? {};
          answer = e.result ?? "";
          turns = e.num_turns;
          tokens = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
        }
        if (e.type !== "assistant") continue;
        for (const c of e.message.content ?? []) {
          if (c.type !== "tool_use") continue;
          // The Skill tool loads a SKILL.md by name.
          if (c.name === "Skill") calls.push({ name: c.name, path: c.input?.skill === name ? join(skill, "SKILL.md") : `/${c.input?.skill}/SKILL.md` });
          else calls.push({ name: c.name, path: toSkill(c.input?.file_path ?? c.input?.path), command: toSkill(c.input?.command) });
        }
      }
      return { answer, tokens, turns, calls };
    },
  },
  codex: {
    notice: "codex: each run copies your Codex login file into a temp folder deleted after the run; a token refresh during a run updates only that copy",
    // A fresh HOME and CODEX_HOME hide installed copies of the skill (~/.agents/skills, ~/.codex/skills) and hold the
    // version's skill and a copy of the login. Both live outside the run folder, which the agent can read.
    command: ({ prompt, skill, out, work }) => {
      const root = mkdtempSync(join(tmpdir(), "skill-diet-codex-"));
      tempHomes.set(out, root);
      const codexHome = join(root, "codex-home");
      mkdirSync(join(codexHome, "skills"), { recursive: true });
      mkdirSync(join(root, "home"), { recursive: true });
      copyFileSync(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"), join(codexHome, "auth.json"));
      chmodSync(join(codexHome, "auth.json"), 0o600);
      if (skill) symlinkSync(skill, join(codexHome, "skills", basename(skill)));
      return {
        cmd: "codex",
        args: ["exec", "--json", "-s", "read-only", "--skip-git-repo-check", "-C", work, ...(opt("model") ? ["-m", opt("model")] : []), ...extra, prompt],
        env: { HOME: join(root, "home"), CODEX_HOME: codexHome },
      };
    },
    parse: (out, stdout, skill) => {
      const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      const calls = [];
      let answer = "";
      const toSkill = toSkillPaths(skill, skill && join(tempHomes.get(out), "codex-home", "skills", basename(skill)));
      for (const e of jsonLines(stdout)) {
        if (e.type === "item.completed" && e.item.type === "agent_message") answer = e.item.text;
        if (e.type === "item.completed" && e.item.type === "command_execution") calls.push({ name: "shell", command: toSkill(e.item.command) });
        // input_tokens includes the cached ones; output_tokens already includes reasoning.
        if (e.type === "turn.completed") {
          const u = e.usage;
          tokens.input += u.input_tokens - u.cached_input_tokens;
          tokens.cacheRead += u.cached_input_tokens;
          tokens.cacheWrite += u.cache_write_input_tokens ?? 0;
          tokens.output += u.output_tokens;
        }
      }
      return { answer, tokens, turns: null, calls }; // --json has no request count
    },
    cleanup: removeTempHome,
  },
  cursor: {
    // A temp HOME holds the version's skill; the Keychains link keeps the macOS login.
    parallel: 1, // a second cursor-agent starting at the same time finds the login keychain locked
    command: ({ prompt, skill, out, work }) => {
      const home = mkdtempSync(join(tmpdir(), "skill-diet-cursor-"));
      tempHomes.set(out, home);
      mkdirSync(join(home, ".cursor", "skills"), { recursive: true });
      if (skill) symlinkSync(skill, join(home, ".cursor", "skills", basename(skill)));
      if (existsSync(join(homedir(), "Library", "Keychains"))) {
        mkdirSync(join(home, "Library"));
        symlinkSync(join(homedir(), "Library", "Keychains"), join(home, "Library", "Keychains"));
      }
      return {
        cmd: "cursor-agent",
        args: ["-p", "--output-format", "stream-json", "--trust", "--force", "--workspace", work, ...(opt("model") ? ["--model", opt("model")] : []), ...extra, prompt],
        env: { HOME: home },
      };
    },
    parse: (out, stdout, skill) => {
      let answer = "", tokens = null;
      const calls = [], modelCalls = new Set();
      const toSkill = toSkillPaths(skill, skill && join(tempHomes.get(out), ".cursor", "skills", basename(skill)));
      for (const e of jsonLines(stdout)) {
        if (e.type === "assistant" && e.model_call_id) modelCalls.add(e.model_call_id);
        if (e.type === "tool_call" && e.subtype === "completed") {
          const [kind, call] = Object.entries(e.tool_call)[0];
          calls.push({ name: kind, path: toSkill(call.args?.path), command: toSkill(call.args?.command) });
        }
        if (e.type === "result") {
          const u = e.usage ?? {};
          answer = e.result ?? "";
          tokens = { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0, cacheRead: u.cacheReadTokens ?? 0, cacheWrite: u.cacheWriteTokens ?? 0 };
        }
      }
      return { answer, tokens, turns: modelCalls.size || null, calls };
    },
    cleanup: removeTempHome,
  },
};

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const active = new Set(); // { out, child? } for each run between preset.command and its cleanup

if (command === "run" && target) await run(resolve(target));
else if (command === "score" && target) score(resolve(target));
else if (command === "calls" && target) calls(target);
else if (command === "check" && target) check(resolve(target));
else {
  const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  const header = lines.slice(0, lines.findIndex((l) => !l.startsWith("//")));
  console.log(header.map((l) => l.slice(3)).join("\n"));
  process.exit(command === "--help" || command === "-h" ? 0 : 2);
}

function loadTasks(dir) {
  const tasks = JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8"));
  const only = opt("tasks");
  return only ? tasks.filter((t) => only.split(",").includes(t.id)) : tasks;
}

function pickPreset() {
  if (opt("cmd")) {
    const template = opt("cmd");
    if (!template.includes("{prompt}")) throw new Error("--cmd needs {prompt} in its template");
    return {
      // One pass, with a function, so a prompt's own "$&" or "{skill}" is left alone.
      command: ({ prompt, skill }) => ({ cmd: "sh", args: ["-c", template.replace(/\{(prompt|skill)\}/g, (_, k) => quote(k === "prompt" ? prompt : (skill ?? "")))] }),
      parse: (out, stdout) => ({ answer: stdout, tokens: null, turns: null, calls: null }),
    };
  }
  const preset = presets[opt("agent", "pi")];
  if (!preset) throw new Error(`unknown --agent ${opt("agent")}; known: ${Object.keys(presets).join(", ")}, or pass --cmd '<template>'`);
  return preset;
}

function skillFolder(dir, v) {
  if (v === "none") return null;
  const base = join(dir, "sk", v);
  const names = readdirSync(base).filter((n) => statSync(join(base, n)).isDirectory());
  if (names.length !== 1) throw new Error(`${base} must hold exactly one skill folder`);
  return join(base, names[0]);
}

async function run(dir) {
  const tasks = loadTasks(dir);
  const versions = opt("versions", "before,after,none").split(",");
  const runs = Number(opt("runs", "3"));
  const preset = pickPreset();
  if (preset.notice) console.log(preset.notice);
  // On a crash or Ctrl-C, stop the agents still running and remove their temp folders.
  process.on("exit", () => {
    for (const { child, out, work } of active) {
      try {
        if (child) process.kill(-child.pid, "SIGKILL");
      } catch {}
      preset.cleanup?.(out);
      rmSync(work, { recursive: true, force: true });
    }
  });
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
  const jobs = [];
  for (let r = 0; r < runs; r++) for (const t of tasks) for (const v of versions) jobs.push({ v, t, r });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await one(dir, preset, jobs[next++]);
  };
  await Promise.all(Array.from({ length: Number(preset.parallel ?? opt("parallel", "6")) }, worker));
}

function one(dir, preset, { v, t, r }) {
  const out = join(dir, "runs", `${v}-${t.id}-${r}`);
  if (existsSync(join(out, "result.json"))) return;
  mkdirSync(out, { recursive: true });
  // The agent works outside the eval folder, where it could find other versions' skills and other runs' answers.
  const work = mkdtempSync(join(tmpdir(), "skill-diet-work-"));
  const entry = { out, work };
  active.add(entry);
  if (t.setup && spawnSync("sh", ["-c", t.setup], { cwd: work, stdio: "inherit" }).status !== 0) throw new Error(`setup failed: ${t.id}`);
  const skill = skillFolder(dir, v);
  const { cmd, args, env } = preset.command({ prompt: t.prompt, skill, out, work });
  const fd = openSync(join(out, "stdout.txt"), "w");
  const start = Date.now();
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: work, env: { ...process.env, ...env }, stdio: ["ignore", fd, fd], detached: true });
    entry.child = child;
    let exit = null;
    const timer = setTimeout(() => {
      exit = "timeout";
      process.kill(-child.pid, "SIGKILL");
    }, 600_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      exit ??= code;
      const check = t.check ? spawnSync("sh", ["-c", t.check], { cwd: work }).status === 0 : null;
      rmSync(work, { recursive: true, force: true });
      const wallMs = Date.now() - start;
      const record = { version: v, task: t.id, run: r, exit, check, wallMs, ...preset.parse(out, readFileSync(join(out, "stdout.txt"), "utf8"), skill) };
      preset.cleanup?.(out);
      active.delete(entry);
      writeFileSync(join(out, "result.json"), JSON.stringify(record));
      console.log(v, t.id, r, exit, `${Math.round(wallMs / 1000)}s`);
      done();
    });
  });
}

function score(dir) {
  const tasks = Object.fromEntries(loadTasks(dir).map((t) => [t.id, t]));
  const rows = {};
  const folder = (existsSync(join(dir, "sk")) ? readdirSync(join(dir, "sk"), { withFileTypes: true }) : []).filter((d) => d.isDirectory()).map((d) => skillFolder(dir, d.name)).find(Boolean);
  const skillDir = folder && `/${basename(folder)}/`;
  for (const name of existsSync(join(dir, "runs")) ? readdirSync(join(dir, "runs")).sort() : []) {
    const out = join(dir, "runs", name);
    if (!existsSync(join(out, "result.json"))) continue;
    const res = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    const t = tasks[res.task];
    if (!t) continue;
    if (!("answer" in res)) throw new Error(`${out} was recorded by an older eval.mjs; delete ${join(dir, "runs")} and run again`);
    const unquote = (s) => s.replace(/["']/g, "");
    const text = unquote(res.answer);
    const code = unquote(
      [...res.answer.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
        .flatMap((m) => m[1].split("\n"))
        .filter((l) => !/^\s*(#|\/\/)/.test(l))
        .join("\n"),
    );
    const missing = (t.must ?? []).filter((p) => !new RegExp(unquote(p), "i").test(text));
    const banned = (t.must_not ?? []).filter((p) => new RegExp(unquote(p), "i").test(code));
    // Skill files the agent opened, from any sk/<version>/<skill>/, by path relative to the skill folder.
    const texts = (res.calls ?? []).flatMap((c) => [c.path, c.command]).filter(Boolean).map(String);
    const reads = res.calls && [...new Set(texts.flatMap((s) => [...s.matchAll(/\/sk\/[^/]+\/[^/\s'"]+\/([^\s'"`;|&)]+)/g)].map((m) => m[1])))];
    const outside = skillDir && texts.flatMap((s) => s.split(/[\s'"`;|&()]+/)).find((p) => p.includes(skillDir) && !p.includes(`/sk/${res.version}${skillDir}`));
    if (outside) console.log(`WARN ${res.version}/${res.task}: read ${outside} from outside sk/${res.version}`);
    const tokens = res.tokens && res.tokens.input + res.tokens.output + res.tokens.cacheRead + res.tokens.cacheWrite;
    const ok = res.exit === 0 && res.check !== false && !missing.length && !banned.length;
    (rows[res.version] ??= []).push({ ...res, ok, tokens, reads });
    if (flags.includes("--detail") && !ok) console.log(`FAIL ${name}  missing=${JSON.stringify(missing)} banned=${JSON.stringify(banned)} exit=${res.exit} check=${res.check}`);
  }
  const versions = Object.keys(rows).sort((a, b) => ["before", "after", "none"].indexOf(a) - ["before", "after", "none"].indexOf(b));
  // An agent whose output doesn't report a number shows "–" instead of a misleading 0.
  const avg = (r, f, digits) => (r.some((x) => f(x) == null) ? "–" : (r.reduce((s, x) => s + f(x), 0) / r.length).toFixed(digits));
  console.log("\n| version | success | tokens/run | turns/run | skill files read/run | wall s/run |\n|---|---|---|---|---|---|");
  for (const v of versions) {
    const r = rows[v];
    const tokens = avg(r, (x) => x.tokens, 0);
    console.log(`| ${v} | ${r.filter((x) => x.ok).length}/${r.length} | ${tokens === "–" ? tokens : Number(tokens).toLocaleString()} | ${avg(r, (x) => x.turns, 1)} | ${avg(r, (x) => x.reads?.length, 1)} | ${avg(r, (x) => x.wallMs / 1000, 0)} |`);
  }
  console.log(`\n| task | ${versions.join(" | ")} |\n|---|${versions.map(() => "---|").join("")}`);
  for (const id of Object.keys(tasks)) {
    const cells = versions.map((v) => {
      const r = rows[v].filter((x) => x.task === id);
      return `${r.filter((x) => x.ok).length}/${r.length}`;
    });
    console.log(`| ${id} | ${cells.join(" | ")} |`);
  }
  for (const id of Object.keys(tasks)) {
    const runs = versions.flatMap((v) => rows[v].filter((x) => x.task === id));
    if (runs.length && !runs.some((x) => x.ok)) console.log(`WARN ${id} fails in every version: check the task, the setup, and whether any version read the skill`);
  }
  for (const v of versions.filter((v) => v !== "none")) {
    const counts = {};
    for (const x of rows[v]) for (const p of x.reads ?? []) counts[p] = (counts[p] ?? 0) + 1;
    console.log(`${v} reads:`, JSON.stringify(counts));
  }
}

function calls(tool) {
  const since = Date.now() - Number(opt("days", "60")) * 86_400_000;
  const by = opt("by", "action").split(",");
  const cli = flags.includes("--cli");
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subcommands = (args) => [...String(args.command ?? "").matchAll(new RegExp(`(?:^|[^\\w-])${escaped} ([a-z][a-z0-9.-]*)`, "g"))].map((m) => m[1]);
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const dirs = opt("dir")
    ? [resolve(opt("dir"))]
    : [join(homedir(), ".pi", "agent", "sessions"), join(homedir(), ".claude", "projects"), join(codexHome, "sessions"), join(homedir(), ".cursor", "projects")];
  const matches = (name, args) =>
    typeof name === "string" && (cli ? subcommands(args).length > 0 : name === tool || name.endsWith(`__${tool}`));
  const seen = new Map(); // call id -> { args, error }; forked sessions repeat entries, so ids dedupe them
  const skill = opt("skill");
  const skillPath = skill && `/${skill}/SKILL.md`;
  const isRead = (name) => typeof name === "string" && /(^|__)read$/i.test(name);
  const readsSkill = (name, args) =>
    (isRead(name) && String(args.path ?? args.file_path ?? "").endsWith(skillPath)) ||
    (name === "Skill" && String(args.skill ?? "").split(":").pop() === skill) || // Claude Code loads a skill through its Skill tool
    String(args.command ?? "").includes(skillPath);
  // Codex shell calls come in several shapes; each becomes { command: "<shell text>" } so --cli and --skill see them.
  const codexCall = (p) => {
    if (p.type === "custom_tool_call") {
      if (p.name !== "exec") return { input: p.input };
      const cmds = [...String(p.input).matchAll(/\bcmd"?\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
      return { command: cmds.join("\n") };
    }
    let args;
    try {
      args = JSON.parse(p.arguments);
    } catch {
      return {};
    }
    if (!args || typeof args !== "object") return {};
    if (Array.isArray(args.command)) return { ...args, command: args.command.at(-1) };
    return args.cmd !== undefined && args.command === undefined ? { ...args, command: args.cmd } : args;
  };
  // A Pi fork repeats its parent's entries, so sessions are counted by their root file.
  const using = new Set(), reading = new Set();
  const files = [];
  const walk = (d) => {
    for (const n of existsSync(d) ? readdirSync(d) : []) {
      const p = join(d, n);
      if (!existsSync(p)) continue; // live sessions can delete temp files mid-scan
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (n.endsWith(".jsonl") && s.mtimeMs >= since) files.push(p);
    }
  };
  dirs.forEach(walk);
  for (const file of files) {
    if (!existsSync(file)) continue;
    // Cursor keeps a session's subagents in <session>/subagents/; count them with their session.
    const root = file.match(/^(.*\/agent-transcripts\/[^/]+)\//)?.[1] ?? file.replace(/\.jsonl$/, "").split("/forks/")[0];
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [n, line] of lines.entries()) {
      if (!line.includes(tool) && !line.includes('"tool_result"') && !line.includes('_call_output"') && !(skillPath && line.includes(skillPath))) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const found = []; // [id, name, args]
      // Codex: response_item payloads; a call and its output share call_id.
      const p = entry.type === "response_item" ? entry.payload : undefined;
      if (p?.type === "function_call" || p?.type === "custom_tool_call") found.push([p.call_id, p.name, codexCall(p)]);
      if ((p?.type === "custom_tool_call_output" || p?.type === "function_call_output") && seen.has(p.call_id)) {
        // Only Codex's code-mode exec reports failure in a parseable way ("Script failed").
        const failed = Array.isArray(p.output) && String(p.output[0]?.text ?? "").startsWith("Script failed");
        seen.get(p.call_id).error = failed ? p.output : null;
      }
      // Pi: assistant toolCall + toolResult message. Claude Code: tool_use + user tool_result. Cursor: tool_use without ids or results.
      const m = entry.message;
      if (m?.role === "toolResult" && seen.has(m.toolCallId)) seen.get(m.toolCallId).error = m.isError ? m.content : null;
      for (const [i, c] of (Array.isArray(m?.content) ? m.content : []).entries()) {
        const args = c.type === "toolCall" ? c.arguments : c.type === "tool_use" ? c.input : undefined;
        if (args) found.push([c.id ?? `${file}:${n}:${i}`, c.name, args]);
        if (c.type === "tool_result" && seen.has(c.tool_use_id)) seen.get(c.tool_use_id).error = c.is_error ? c.content : null;
      }
      for (const [id, name, args] of found) {
        if (matches(name, args)) using.add(root), seen.set(id, { args, error: null });
        if (skillPath && readsSkill(name, args)) reading.add(root);
      }
    }
  }
  const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const keys = new Map(), values = new Map(), errors = new Map();
  for (const { args, error } of seen.values()) {
    if (cli) for (const sub of subcommands(args)) count(keys, sub);
    else for (const k of Object.keys(args)) count(keys, k);
    if (!cli) for (const k of by) if (args[k] !== undefined) count(values, `${k}=${JSON.stringify(args[k])}`);
    if (error) {
      const text = typeof error === "string" ? error : error.map((p) => p.text ?? "").join(" ");
      // Drop quoted values and a trailing id ("...not found: pr42-gate") so one message groups across sessions.
      count(errors, text.split("\n")[0].replace(/'[^']*'|"[^"]*"/g, "'…'").replace(/:\s*\S+$/, ": …").slice(0, 120));
    }
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${String(v).padStart(6)}  ${k}`).join("\n");
  const errorCount = [...errors.values()].reduce((a, b) => a + b, 0);
  console.log(`${seen.size} ${tool} calls in ${files.length} session files, ${errorCount} errors\n\n${cli ? "subcommands" : "argument keys"}:\n${top(keys, 30)}`);
  if (values.size) console.log(`\n${by.join(", ")} values:\n${top(values, 20)}`);
  if (errors.size) console.log(`\ntop errors:\n${top(errors, 15)}`);
  if (skill) console.log(`\n${skill}/SKILL.md read in ${[...using].filter((r) => reading.has(r)).length} of ${using.size} sessions that call ${tool}`);
}

function check(root) {
  const size = statSync(join(root, "SKILL.md")).size;
  const name = skillName(root);
  if (!name) throw new Error(`${root}/SKILL.md has no name: in its frontmatter`);
  const store = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "skill-diet", "baselines.json");
  const baselines = existsSync(store) ? JSON.parse(readFileSync(store, "utf8")) : {};
  if (flags.includes("--baseline")) {
    baselines[name] = size;
    mkdirSync(dirname(store), { recursive: true });
    writeFileSync(store, `${JSON.stringify(baselines, null, 2)}\n`);
    console.log(`baseline for ${name}: ${size} bytes, in ${store}`);
    return;
  }
  const baseline = baselines[name] ?? null;
  const grown = baseline !== null && size > baseline * 1.1;
  if (baseline === null) console.log(`no baseline for ${name}; record one with check --baseline after a diet`);
  else console.log(`SKILL.md ${size} bytes, baseline ${baseline} (${Math.round((size / baseline - 1) * 100)}%)${grown ? ": over 10%, do a full diet (skill-diet references/diet.md)" : ""}`);
  const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  const cache = {};
  const anchors = (file) =>
    (cache[file] ??= new Set([...readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]))));
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (n === ".git" || n === "node_modules") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".md")) files.push(p);
    }
  };
  walk(root);
  let broken = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(link)) continue;
      const [path, anchor] = link.split("#");
      const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      const why = !existsSync(dest) ? "missing file" : anchor && dest.endsWith(".md") && !anchors(dest).has(anchor) ? "missing heading" : null;
      if (why) {
        broken++;
        console.log(`${file.slice(root.length + 1)}: ${link} (${why})`);
      }
    }
  }
  console.log(broken ? `${broken} broken link(s)` : `links ok (${files.length} files)`);
  process.exit(broken || grown ? 1 : 0);
}
