#!/usr/bin/env node
// Release helper. package.json holds the version; this keeps the other files in step.
//   node tools/version.mjs           (run by `npm version`) copies the version into .claude-plugin/plugin.json and
//                                    each skill's metadata.version, and turns the CHANGELOG's Unreleased notes into
//                                    a dated release section
//   node tools/version.mjs --check   exits 1 when plugin.json or a skill's metadata.version differs from package.json
//   node tools/version.mjs --notes   prints the CHANGELOG section of the current version, for the GitHub release
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const write = (path, text) => writeFileSync(new URL(`../${path}`, import.meta.url), text);
const { version } = JSON.parse(read("package.json"));
const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const changelog = read("CHANGELOG.md");
const mode = process.argv[2];
// Skill managers such as asm read the version from each SKILL.md's metadata, not from package.json.
const skills = readdirSync(new URL("../skills", import.meta.url)).map((name) => `skills/${name}/SKILL.md`);
const metaVersion = /^ {2}version: (.*)$/m;

if (mode === "--check") {
  if (plugin.version !== version) throw new Error(`.claude-plugin/plugin.json is ${plugin.version}, package.json is ${version}`);
  for (const path of skills) {
    const found = read(path).match(metaVersion)?.[1];
    if (found !== version) throw new Error(`${path} has metadata.version ${found}, package.json is ${version}`);
  }
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
  for (const path of skills) write(path, read(path).replace(metaVersion, `  version: ${version}`));
}
