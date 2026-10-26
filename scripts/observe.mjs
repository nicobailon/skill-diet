#!/usr/bin/env node
// Logs each call of a CLI to JSONL and passes its input and output through unchanged.
// Setup:   node observe.mjs shim <tool> [bin-dir=/tmp/diet/bin]   writes a <tool> shim into bin-dir and prints
//          the line that runs the eval with it first on PATH
// Shim:    OBSERVE_REAL=<real binary> OBSERVE_LOG=<file.jsonl> [OBSERVE_TAGS="k=v …"] node observe.mjs <args…>
//          eval.mjs run sets OBSERVE_TAGS to each run's version, task and run.
// Summary: node observe.mjs --summary <file.jsonl>
// Each call is logged with a kind:
//   lookup   arguments match OBSERVE_LOOKUP (default: --help, -h, --help-full, --help-topic, --find); set it for
//            tools whose bare group name prints help
//   invalid  nonzero exit whose first error or output line matches OBSERVE_INVALID (default: unknown, unsupported,
//            invalid, usage); tune it to the tool's own wrong-guess messages so runtime failures don't count
//   action   everything else
// Without OBSERVE_REAL set, prints this help.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

if (args[0] === "shim" && args[1]) {
  const [, tool, dir = "/tmp/diet/bin"] = args;
  const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const found = execFileSync("sh", ["-c", 'command -v "$0" || true', tool], { encoding: "utf8" }).trim();
  if (!found.startsWith("/")) throw new Error(`observe: ${tool} is not an executable on PATH`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, tool), `#!/bin/sh\nOBSERVE_REAL=${quote(found)} exec node ${quote(fileURLToPath(import.meta.url))} "$@"\n`, { mode: 0o755 });
  console.log(`PATH=${dir}:$PATH OBSERVE_LOG=/tmp/diet/calls.jsonl node ${quote(join(dirname(fileURLToPath(import.meta.url)), "eval.mjs"))} run <dir> …`);
  process.exit(0);
}

if (args[0] === "--summary") {
  const rows = readFileSync(args[1], "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const groups = {};
  const firstCall = new Set();
  for (const row of rows) {
    const { task, run, ...rest } = row.tags;
    const key = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(" ") || "all";
    const group = (groups[key] ??= { calls: 0, action: 0, lookup: 0, invalid: 0, lookupKB: 0, runs: 0, validFirst: 0 });
    group.calls++;
    group[row.kind]++;
    if (row.kind === "lookup") group.lookupKB += (row.stdoutBytes + row.stderrBytes) / 1024;
    // The first non-lookup call of each task run shows whether the agent knew the right command.
    const runKey = `${key}|${task}|${run}`;
    if (row.kind !== "lookup" && !firstCall.has(runKey)) {
      firstCall.add(runKey);
      group.runs++;
      if (row.kind !== "invalid") group.validFirst++;
    }
  }
  for (const group of Object.values(groups)) {
    group.lookupKB = Math.round(group.lookupKB * 10) / 10;
    group["validFirst%"] = group.runs ? Math.round((100 * group.validFirst) / group.runs) : null;
  }
  console.table(groups);
  process.exit(0);
}

const real = process.env.OBSERVE_REAL;
if (!real) {
  const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  const header = lines.slice(0, lines.findIndex((l) => !l.startsWith("//")));
  console.error(header.map((l) => l.slice(3)).join("\n"));
  process.exit(2);
}
const lookup = new RegExp(process.env.OBSERVE_LOOKUP || "(^| )(--help|-h|--help-full|--help-topic|--find)( |$)");
const invalid = new RegExp(process.env.OBSERVE_INVALID || "unknown|unsupported|invalid|usage", "i");
const started = Date.now();
let stdoutBytes = 0;
let stderrBytes = 0;
let stdoutHead = "";
let stderrHead = "";

const child = spawn(real, args, { stdio: ["inherit", "pipe", "pipe"] });
let spawnFailed = false;
child.on("error", (error) => {
  spawnFailed = true;
  console.error(`observe: cannot run ${real}: ${error.message}`);
  process.exitCode = 127;
});
child.stdout.on("data", (chunk) => {
  stdoutBytes += chunk.length;
  if (stdoutHead.length < 400) stdoutHead += chunk.toString();
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  stderrBytes += chunk.length;
  if (stderrHead.length < 400) stderrHead += chunk.toString();
  process.stderr.write(chunk);
});
child.on("close", (code, signal) => {
  if (spawnFailed) return;
  const firstLine = (text) => text.split("\n").find((line) => line.trim()) || "";
  const firstError = firstLine(stderrHead);
  const failed = code !== 0 && (invalid.test(firstError) || invalid.test(firstLine(stdoutHead)));
  const kind = lookup.test(args.join(" ")) ? "lookup" : failed ? "invalid" : "action";
  const tags = Object.fromEntries(
    (process.env.OBSERVE_TAGS || "").split(/\s+/).filter((tag) => tag.includes("=")).map((tag) => [tag.slice(0, tag.indexOf("=")), tag.slice(tag.indexOf("=") + 1)]),
  );
  if (process.env.OBSERVE_LOG) {
    const record = { at: new Date(started).toISOString(), tags, args, code, signal, ms: Date.now() - started, stdoutBytes, stderrBytes, firstError: firstError.slice(0, 200), kind };
    mkdirSync(dirname(process.env.OBSERVE_LOG), { recursive: true });
    appendFileSync(process.env.OBSERVE_LOG, `${JSON.stringify(record)}\n`);
  }
  // Set the code and let Node exit on its own, so piped output finishes draining first.
  process.exitCode = signal ? 128 + constants.signals[signal] : code;
});
