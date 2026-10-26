#!/usr/bin/env node
// Release helper. package.json holds the version; this keeps the other files in step.
//   node tools/version.mjs           (run by `npm version`) copies the version into .claude-plugin/plugin.json
//                                    and turns the CHANGELOG's Unreleased notes into a dated release section
//   node tools/version.mjs --check   exits 1 when plugin.json and package.json versions differ
//   node tools/version.mjs --notes   prints the CHANGELOG section of the current version, for the GitHub release
import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const write = (path, text) => writeFileSync(new URL(`../${path}`, import.meta.url), text);
const { version } = JSON.parse(read("package.json"));
const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const changelog = read("CHANGELOG.md");
const mode = process.argv[2];

if (mode === "--check") {
  if (plugin.version !== version) throw new Error(`.claude-plugin/plugin.json is ${plugin.version}, package.json is ${version}`);
  console.log(`version ${version} in step`);
} else if (mode === "--notes") {
  const section = changelog.split(/^## /m).find((s) => s.startsWith(`[${version}]`));
  if (!section) throw new Error(`CHANGELOG.md has no [${version}] section`);
  console.log(section.split("\n").slice(1).join("\n").trim());
} else {
  const unreleased = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!unreleased?.[1].trim()) throw new Error("CHANGELOG.md has nothing under [Unreleased]");
  const date = new Date().toISOString().slice(0, 10);
  write("CHANGELOG.md", changelog.replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${version}] - ${date}\n`));
  write(".claude-plugin/plugin.json", `${JSON.stringify({ ...plugin, version }, null, 2)}\n`);
}
