#!/usr/bin/env node
// Runs the before/after eval with a coding agent and scores it.
// Layout: <dir>/tasks.json  [{ id, prompt, must?: [regex], must_not?: [regex], setup?: "sh", check?: "sh" }]
//         <dir>/sk/<version>/<skill>/   one skill folder per version; "none" needs no folder
//         <dir>/adapter                 runs one session of your agent; references/adapter.md says how to write it
// Run:    node eval.mjs run <dir> [--versions before,after,none] [--tasks a,b] [--runs 3] [--parallel 6] [--model <id>]
//         prints how many sessions it will start, calibrates the adapter, then runs every version, task and run.
//         --model is passed to the adapter as EVAL_MODEL, and each run sets OBSERVE_TAGS="version=… task=… run=…"
//         for observe.mjs.
// Calibrate: node eval.mjs calibrate <dir> [--model <id>]   three short runs at once that the adapter must pass:
//         the agent quotes a line only its copy of the skill holds, says it has no skill when given none, and
//         runs a shell command.
// Score:  node eval.mjs score <dir> [--detail]   exits 1 on any MISS (before passed a task on every run, after on
//         none), WORSE (after's pass rate is lower by more than chance explains) or WARN (a run read the skill from
//         outside sk/<version>, a task fails in every version or has runs but left tasks.json, or under half the
//         runs given the skill read it).
// Check:  node eval.mjs check <skill-dir>   prints SKILL.md's size and exits 1 on a relative link or #anchor that
//         does not resolve.
// Scoring removes quotes first, so `"$DIR/tool" main` matches `tool main`. `must` patterns match anywhere
// in the agent's output; `must_not` patterns match only code-block lines that are not comments, so
// "I won't run X" passes. `setup`, the agent and `check` run in a temp work dir, deleted after `check`; `check`
// must exit 0. observe.mjs logs only the agent's calls, not those of `setup` and `check`.
// Finished runs are kept, so rerunning `run` only fills in missing ones. A timeout counts as a failed run; any other
// adapter failure stops the eval.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const [command, target, ...flags] = process.argv.slice(2);
const opt = (name, fallback) => (flags.includes(`--${name}`) ? flags[flags.indexOf(`--${name}`) + 1] : fallback);

// On a crash or Ctrl-C, stop the adapters still running and remove their work dirs. SIGTERM lets an adapter delete what
// it made outside its out-dir, such as a copied login; adapters are detached, so they outlive this process to do it.
const children = new Set(), works = new Set();
process.on("exit", () => {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  for (const work of works) rmSync(work, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

if (command === "run" && target) await run(resolve(target));
else if (command === "calibrate" && target) await calibrate(resolve(target));
else if (command === "score" && target) score(resolve(target));
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

function skillFolder(dir, v) {
  if (v === "none") return null;
  const base = join(dir, "sk", v);
  const names = readdirSync(base).filter((n) => statSync(join(base, n)).isDirectory());
  if (names.length !== 1) throw new Error(`${base} must hold exactly one skill folder`);
  return join(base, names[0]);
}

// The first version folder's skill; calibration copies its front matter and score finds reads by its folder name.
function anySkill(dir) {
  const versions = readdirSync(join(dir, "sk"), { withFileTypes: true }).filter((d) => d.isDirectory());
  const skill = versions.map((d) => skillFolder(dir, d.name)).find(Boolean);
  if (!skill) throw new Error(`${join(dir, "sk")} holds no <version>/<skill>/ folder`);
  return skill;
}

// Runs fn on each item, at most --parallel at once; resolves to the results in item order.
async function pool(items, fn) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Number(opt("parallel", "6")) }, worker));
  return results;
}

// Every run and calibration starts the adapter the same way: <dir>/adapter <skill folder or ""> <prompt> <out> <work>.
// Resolves to its exit code, or "timeout" after 10 minutes.
function session(dir, { skill, prompt, out, work, tags }) {
  const adapter = join(dir, "adapter");
  const log = openSync(join(out, "adapter.log"), "w");
  const env = { ...process.env, ...(opt("model") ? { EVAL_MODEL: opt("model") } : {}), OBSERVE_TAGS: tags };
  return new Promise((done) => {
    const child = spawn(adapter, [skill ?? "", prompt, out, work], { cwd: work, env, stdio: ["ignore", log, log], detached: true });
    children.add(child);
    let exit = null;
    const timer = setTimeout(() => {
      exit = "timeout";
      process.kill(-child.pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 10_000).unref();
    }, 600_000);
    child.on("error", (e) => {
      throw new Error(`can't start ${adapter}: ${e.message}; write it as references/adapter.md says`);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      closeSync(log);
      children.delete(child);
      done(exit ?? code);
    });
  });
}

// The adapter is the user's code, so its result.json is checked against references/adapter.md.
function readResult(out, exit) {
  const file = join(out, "result.json");
  if (exit !== 0 || !existsSync(file)) throw new Error(`adapter exited ${exit}${existsSync(file) ? "" : " without writing result.json"}; its output is in ${out}`);
  const r = JSON.parse(readFileSync(file, "utf8"));
  const ok =
    typeof r.answer === "string" &&
    ["input", "output", "cacheRead", "cacheWrite"].every((k) => Number.isFinite(r.tokens?.[k])) &&
    r.tokens.output > 0 &&
    r.tokens.input + r.tokens.cacheRead > 0 &&
    (r.turns == null || Number.isFinite(r.turns)) &&
    Array.isArray(r.calls) &&
    r.calls.every((c) => typeof c?.name === "string");
  if (!ok) throw new Error(`${file} needs answer, non-zero tokens { input, output, cacheRead, cacheWrite }, turns and calls [{ name, path?, command? }]`);
  return { answer: r.answer, tokens: r.tokens, turns: r.turns ?? null, calls: r.calls };
}

async function calibrate(dir) {
  const real = anySkill(dir);
  const name = basename(real);
  const front = readFileSync(join(real, "SKILL.md"), "utf8").match(/^---\n[\s\S]*?\n---\n/)?.[0];
  if (!front) throw new Error(`${join(real, "SKILL.md")} has no front matter`);
  // A fresh line under the real skill's name and description: only the copy given to the adapter holds it, and an
  // installed copy of the skill shows up in the run that gets none.
  const canary = `CANARY-${Math.random().toString(36).slice(2, 10)}`;
  const base = join(dir, "calibration");
  rmSync(base, { recursive: true, force: true });
  const skill = join(base, "copy", name);
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), `${front}${canary}\n`);
  const read = join(skill, "SKILL.md");
  const cases = [
    {
      id: "skill",
      skill,
      prompt: `Use the ${name} skill. Reply with only the first line of its body (the first line after the front matter), nothing else.`,
      checks: (answer, texts) => [
        [answer.includes(canary), `the agent quotes ${canary}, a line only its copy of the skill holds`],
        [texts.some((s) => s.includes(read)), `calls show it reading ${read}`],
      ],
    },
    {
      id: "none",
      prompt: `If you have a skill named ${name}, reply with only the first line of its body. Otherwise reply exactly NO-SKILL.`,
      checks: (answer, texts) => [
        [answer.includes("NO-SKILL"), "given no skill, the agent has none (a quoted line means an installed copy is visible)"],
        [!texts.some((s) => s.includes(`/${name}/SKILL.md`)), `calls read no ${name}/SKILL.md`],
      ],
    },
    {
      id: "shell",
      prompt: "Run this shell command and reply with only its output: echo calib-$((6*7))",
      checks: (answer, texts) => [
        [answer.includes("calib-42"), "the agent runs a shell command and replies with its output"],
        [texts.some((s) => s.includes("echo calib-")), "calls record the shell command"],
      ],
    },
  ];
  // As many at once as the eval runs, so runs that share anything fail here.
  const lines = await pool(cases, async (c) => {
    const out = join(base, c.id);
    mkdirSync(out);
    const work = mkdtempSync(join(tmpdir(), "skill-diet-work-"));
    works.add(work);
    const exit = await session(dir, { skill: c.skill, prompt: c.prompt, out, work, tags: `version=calibrate task=${c.id} run=0` });
    rmSync(work, { recursive: true, force: true });
    works.delete(work);
    let r;
    try {
      r = readResult(out, exit);
    } catch (e) {
      return [[false, e.message]];
    }
    const texts = r.calls.flatMap((x) => [x.path, x.command]).filter(Boolean).map(String);
    return c.checks(r.answer, texts);
  });
  const results = lines.flatMap((l, i) => l.map(([ok, what]) => [ok, `${cases[i].id}: ${what}`]));
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (results.some(([ok]) => !ok)) {
    console.log(`calibration failed: fix ${join(dir, "adapter")}; each run's output is in ${base}`);
    process.exit(1);
  }
  console.log("calibration passed");
}

async function run(dir) {
  const tasks = loadTasks(dir);
  const versions = opt("versions", "before,after,none").split(",");
  const runs = Number(opt("runs", "3"));
  const jobs = [];
  for (let r = 0; r < runs; r++) for (const t of tasks) for (const v of versions) jobs.push({ v, t, r, folder: join(dir, "runs", `${v}-${t.id}-${r}`) });
  const todo = jobs.filter((job) => !existsSync(join(job.folder, "result.json")));
  console.log(`${todo.length} sessions to run (${versions.length} versions × ${tasks.length} tasks × ${runs} runs; ${jobs.length - todo.length} already done)`);
  if (!todo.length) return;
  await calibrate(dir);
  await pool(todo, (job) => one(dir, job));
}

async function one(dir, { v, t, r, folder }) {
  // The adapter writes into agent/; result.json beside it marks the run finished, so a run cut off part-way starts over.
  const out = join(folder, "agent");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // The agent works outside the eval folder, where it could find other versions' skills and other runs' answers.
  const work = mkdtempSync(join(tmpdir(), "skill-diet-work-"));
  works.add(work);
  // setup and check are not the agent's calls, so observe.mjs must not log them.
  const env = { ...process.env, OBSERVE_LOG: "" };
  if (t.setup && spawnSync("sh", ["-c", t.setup], { cwd: work, env, stdio: "inherit" }).status !== 0) throw new Error(`setup failed: ${t.id}`);
  const start = Date.now();
  const exit = await session(dir, { skill: skillFolder(dir, v), prompt: t.prompt, out, work, tags: `version=${v} task=${t.id} run=${r}` });
  const check = t.check ? spawnSync("sh", ["-c", t.check], { cwd: work, env }).status === 0 : null;
  rmSync(work, { recursive: true, force: true });
  works.delete(work);
  const wallMs = Date.now() - start;
  // A timeout counts as a failed run. Any other adapter failure stops the eval, and rerunning retries the run.
  const result = exit === "timeout" ? { answer: "", tokens: null, turns: null, calls: null } : readResult(out, exit);
  writeFileSync(join(folder, "result.json"), JSON.stringify({ version: v, task: t.id, run: r, exit, check, wallMs, ...result }));
  console.log(v, t.id, r, exit, `${Math.round(wallMs / 1000)}s`);
}

function score(dir) {
  const tasks = Object.fromEntries(loadTasks(dir).map((t) => [t.id, t]));
  const rows = {};
  const skillDir = `/${basename(anySkill(dir))}/`;
  // Every MISS and WARN makes score exit 1, so an agent working alone knows not to ship.
  let flagged = 0;
  const flag = (line) => {
    flagged++;
    console.log(line);
  };
  for (const name of existsSync(join(dir, "runs")) ? readdirSync(join(dir, "runs")).sort() : []) {
    const out = join(dir, "runs", name);
    if (!existsSync(join(out, "result.json"))) continue;
    const res = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    const t = tasks[res.task];
    if (!t) {
      if (!opt("tasks")) flag(`WARN runs/${name}: task ${res.task} isn't in tasks.json. Only a task every version fails can be removed, and its runs go with it.`);
      continue;
    }
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
    const outside = texts.flatMap((s) => s.split(/[\s'"`;|&()]+/)).find((p) => p.includes(skillDir) && !p.includes(`/sk/${res.version}${skillDir}`));
    if (outside) flag(`WARN ${res.version}/${res.task}: read ${outside} from outside sk/${res.version}`);
    const tokens = res.tokens && res.tokens.input + res.tokens.output + res.tokens.cacheRead + res.tokens.cacheWrite;
    const ok = res.exit === 0 && res.check !== false && !missing.length && !banned.length;
    (rows[res.version] ??= []).push({ ...res, ok, tokens, reads });
    if (flags.includes("--detail") && !ok) console.log(`FAIL ${name}  missing=${JSON.stringify(missing)} banned=${JSON.stringify(banned)} exit=${res.exit} check=${res.check}`);
  }
  const versions = Object.keys(rows).sort((a, b) => ["before", "after", "none"].indexOf(a) - ["before", "after", "none"].indexOf(b));
  // Timed-out runs, and agents that don't report turns, are left out of a column instead of counting as 0.
  const avg = (r, f, digits) => {
    const xs = r.map(f).filter((x) => x != null);
    return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(digits) : "–";
  };
  console.log("\n| version | success | tokens/run | turns/run | skill files read/run | wall s/run |\n|---|---|---|---|---|---|");
  for (const v of versions) {
    const r = rows[v];
    const tokens = avg(r, (x) => x.tokens, 0);
    console.log(`| ${v} | ${r.filter((x) => x.ok).length}/${r.length} | ${tokens === "–" ? tokens : Number(tokens).toLocaleString()} | ${avg(r, (x) => x.turns, 1)} | ${avg(r, (x) => x.reads?.length, 1)} | ${avg(r, (x) => x.wallMs / 1000, 0)} |`);
  }
  console.log("\ntokens/run counts cache reads at full price: use it to compare versions, not to cost them.");
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
    if (runs.length && !runs.some((x) => x.ok)) flag(`WARN ${id} fails in every version, so it can't tell them apart. Fix it and rerun it in every version, or remove it and its runs.`);
    const before = rows.before?.filter((x) => x.task === id) ?? [];
    const after = rows.after?.filter((x) => x.task === id) ?? [];
    // Two equally good versions split all-vs-none by chance in at most 1 task in 64 at 3 runs, so a MISS is rerun first.
    if (before.length && after.length && before.every((x) => x.ok) && !after.some((x) => x.ok))
      flag(`MISS ${id}: before passed every run and after passed none. Rerun with --tasks ${id} --versions before,after --runs 6; if it still fails, its logs show what after is missing.`);
  }
  // A drop within two standard errors is noise at these run counts; a bigger one is a worse skill.
  if (rows.before && rows.after) {
    const rate = (r) => r.filter((x) => x.ok).length / r.length;
    const [b, a] = [rate(rows.before), rate(rows.after)];
    const se = Math.sqrt((b * (1 - b)) / rows.before.length + (a * (1 - a)) / rows.after.length);
    if (b - a > 2 * se) flag(`WORSE after passed ${Math.round(a * 100)}% of runs and before ${Math.round(b * 100)}%, a bigger gap than chance explains. after's failing outputs show what it's missing.`);
  }
  const skilled = versions.filter((v) => v !== "none").flatMap((v) => rows[v]).filter((x) => x.reads);
  const read = skilled.filter((x) => x.reads.length).length;
  if (read < skilled.length / 2) flag(`WARN only ${read} of ${skilled.length} runs that had the skill read it, so these scores mostly measure the tool's own text. To measure the skill, rerun in a new eval folder with prompts that name it.`);
  for (const v of versions.filter((v) => v !== "none")) {
    const counts = {};
    for (const x of rows[v]) for (const p of x.reads ?? []) counts[p] = (counts[p] ?? 0) + 1;
    console.log(`${v} reads:`, JSON.stringify(counts));
  }
  if (flagged) process.exitCode = 1;
}

function check(root) {
  console.log(`SKILL.md ${statSync(join(root, "SKILL.md")).size} bytes`);
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
