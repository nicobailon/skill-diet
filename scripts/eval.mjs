#!/usr/bin/env node
// Runs the before/after eval with Pi and scores it.
// Layout: <dir>/tasks.json  [{ id, prompt, must?: [regex], must_not?: [regex], setup?: "sh", check?: "sh" }]
//         <dir>/sk/<version>/<skill>/   one skill folder per version; "none" needs no folder
// Run:    node eval.mjs run <dir> [--versions before,after,none] [--tasks a,b] [--runs 3] [--parallel 6]
//                       [--model provider/id] [--tools read] [-- extra pi args, e.g. -e <extension>]
// Score:  node eval.mjs score <dir> [--detail]
// Links:  node eval.mjs links <skill-dir>   exits 1 on a relative link or #anchor that does not resolve
// Scoring removes quotes first, so `"$DIR/tool" main` matches `tool main`. `must` patterns match anywhere
// in the agent's output; `must_not` patterns match only code-block lines that are not comments, so
// "I won't run X" passes. `setup` and `check` run in the run's work dir; `check` must exit 0.
// Finished runs are kept, so rerunning `run` only fills in missing ones.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [command, target, ...rest] = process.argv.slice(2);
const dash = rest.indexOf("--");
const flags = dash >= 0 ? rest.slice(0, dash) : rest;
const piExtra = dash >= 0 ? rest.slice(dash + 1) : [];
const opt = (name, fallback) => (flags.includes(`--${name}`) ? flags[flags.indexOf(`--${name}`) + 1] : fallback);

if (command === "run" && target) await run(resolve(target));
else if (command === "score" && target) score(resolve(target));
else if (command === "links" && target) links(resolve(target));
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
  for (const v of versions.filter((v) => v !== "none")) {
    const counts = {};
    for (const x of rows[v]) for (const p of x.reads) counts[p] = (counts[p] ?? 0) + 1;
    console.log(`${v} reads:`, JSON.stringify(counts));
  }
}

function links(root) {
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
  process.exit(broken ? 1 : 0);
}
