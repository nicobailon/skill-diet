#!/usr/bin/env node
// Runs the before/after eval with Pi and scores it.
// Layout: <dir>/tasks.json  [{ id, prompt, must?: [regex], must_not?: [regex], setup?: "sh", check?: "sh" }]
//         <dir>/sk/<version>/<skill>/   one skill folder per version; "none" needs no folder
// Run:    node eval.mjs run <dir> [--versions before,after,none] [--tasks a,b] [--runs 3] [--parallel 6]
//                       [--model provider/id] [--tools read] [-- extra pi args, e.g. -e <extension>]
// Score:  node eval.mjs score <dir> [--detail]
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
// "I won't run X" passes. `setup` and `check` run in the run's work dir; `check` must exit 0.
// Finished runs are kept, so rerunning `run` only fills in missing ones.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const [command, target, ...rest] = process.argv.slice(2);
const dash = rest.indexOf("--");
const flags = dash >= 0 ? rest.slice(0, dash) : rest;
const piExtra = dash >= 0 ? rest.slice(dash + 1) : [];
const opt = (name, fallback) => (flags.includes(`--${name}`) ? flags[flags.indexOf(`--${name}`) + 1] : fallback);

if (command === "run" && target) await run(resolve(target));
else if (command === "score" && target) score(resolve(target));
else if (command === "calls" && target) calls(target);
else if (command === "check" && target) check(resolve(target));
else {
  const header = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1).filter((l) => l.startsWith("//"));
  console.log(header.map((l) => l.slice(3)).join("\n"));
  process.exit(command === "--help" || command === "-h" ? 0 : 2);
}

function loadTasks(dir) {
  const tasks = JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8"));
  const only = opt("tasks");
  return only ? tasks.filter((t) => only.split(",").includes(t.id)) : tasks;
}

async function run(dir) {
  const tasks = loadTasks(dir);
  const versions = opt("versions", "before,after,none").split(",");
  const runs = Number(opt("runs", "3"));
  const jobs = [];
  for (let r = 0; r < runs; r++) for (const t of tasks) for (const v of versions) jobs.push({ v, t, r });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await one(dir, jobs[next++]);
  };
  await Promise.all(Array.from({ length: Number(opt("parallel", "6")) }, worker));
}

function one(dir, { v, t, r }) {
  const out = join(dir, "runs", `${v}-${t.id}-${r}`);
  const work = join(out, "work");
  if (existsSync(join(out, "result.json"))) return;
  mkdirSync(work, { recursive: true });
  if (t.setup && spawnSync("sh", ["-c", t.setup], { cwd: work, stdio: "inherit" }).status !== 0) throw new Error(`setup failed: ${t.id}`);
  const skill = [];
  if (v !== "none") {
    const base = join(dir, "sk", v);
    const names = readdirSync(base).filter((n) => statSync(join(base, n)).isDirectory());
    if (names.length !== 1) throw new Error(`${base} must hold exactly one skill folder`);
    skill.push("--skill", join(base, names[0]));
  }
  const model = opt("model") ? ["--model", opt("model")] : [];
  const args = ["-p", "-ne", "-nc", "-ns", "-np", "--tools", opt("tools", "read"), ...skill, "--session-dir", join(out, "sessions"), ...model, ...piExtra, t.prompt];
  const fd = openSync(join(out, "stdout.txt"), "w");
  const start = Date.now();
  return new Promise((done) => {
    const child = spawn("pi", args, { cwd: work, stdio: ["ignore", fd, fd], detached: true });
    let exit = null;
    const timer = setTimeout(() => {
      exit = "timeout";
      process.kill(-child.pid, "SIGKILL");
    }, 600_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      exit ??= code;
      const check = t.check ? spawnSync("sh", ["-c", t.check], { cwd: work }).status === 0 : null;
      const wall = Math.round((Date.now() - start) / 1000);
      writeFileSync(join(out, "result.json"), JSON.stringify({ version: v, task: t.id, run: r, exit, check, wall }));
      console.log(v, t.id, r, exit, `${wall}s`);
      done();
    });
  });
}

function score(dir) {
  const tasks = Object.fromEntries(loadTasks(dir).map((t) => [t.id, t]));
  const rows = {};
  for (const name of existsSync(join(dir, "runs")) ? readdirSync(join(dir, "runs")).sort() : []) {
    const out = join(dir, "runs", name);
    if (!existsSync(join(out, "result.json"))) continue;
    const res = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    const t = tasks[res.task];
    if (!t) continue;
    const raw = readFileSync(join(out, "stdout.txt"), "utf8");
    const unquote = (s) => s.replace(/["']/g, "");
    const text = unquote(raw);
    const code = unquote(
      [...raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
        .flatMap((m) => m[1].split("\n"))
        .filter((l) => !/^\s*(#|\/\/)/.test(l))
        .join("\n"),
    );
    const missing = (t.must ?? []).filter((p) => !new RegExp(unquote(p), "i").test(text));
    const banned = (t.must_not ?? []).filter((p) => new RegExp(unquote(p), "i").test(code));
    let tokens = 0, turns = 0;
    const reads = new Set();
    const sessions = join(out, "sessions");
    for (const f of existsSync(sessions) ? readdirSync(sessions).filter((f) => f.endsWith(".jsonl")) : []) {
      for (const line of readFileSync(join(sessions, f), "utf8").split("\n")) {
        let m;
        try {
          m = JSON.parse(line).message;
        } catch {
          continue;
        }
        if (m?.role !== "assistant") continue;
        turns++;
        const u = m.usage ?? {};
        tokens += (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
        for (const c of m.content ?? []) {
          const hit = c.type === "toolCall" && String(c.arguments?.path ?? "").match(/\/sk\/[^/]+\/[^/]+\/(.+)$/);
          if (hit) reads.add(hit[1]);
        }
      }
    }
    const ok = res.exit === 0 && res.check !== false && !missing.length && !banned.length;
    (rows[res.version] ??= []).push({ ...res, ok, tokens, turns, reads: [...reads] });
    if (flags.includes("--detail") && !ok) console.log(`FAIL ${name}  missing=${JSON.stringify(missing)} banned=${JSON.stringify(banned)} exit=${res.exit} check=${res.check}`);
  }
  const versions = Object.keys(rows).sort((a, b) => ["before", "after", "none"].indexOf(a) - ["before", "after", "none"].indexOf(b));
  const avg = (r, f) => r.reduce((s, x) => s + f(x), 0) / r.length;
  console.log("\n| version | success | tokens/run | turns/run | skill files read/run | wall s/run |\n|---|---|---|---|---|---|");
  for (const v of versions) {
    const r = rows[v];
    console.log(`| ${v} | ${r.filter((x) => x.ok).length}/${r.length} | ${Math.round(avg(r, (x) => x.tokens)).toLocaleString()} | ${avg(r, (x) => x.turns).toFixed(1)} | ${avg(r, (x) => x.reads.length).toFixed(1)} | ${Math.round(avg(r, (x) => x.wall))} |`);
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
    for (const x of rows[v]) for (const p of x.reads) counts[p] = (counts[p] ?? 0) + 1;
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
  const name = readFileSync(join(root, "SKILL.md"), "utf8").match(/^name:\s*(.+)$/m)?.[1].trim();
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
