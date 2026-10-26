# Releasing

`package.json` holds the version. Release only when the owner asks.

1. Write the release notes under `## [Unreleased]` in `CHANGELOG.md`, for someone who has never used skill-diet.
2. `npm version <patch|minor|major> -m "chore(release): v%s"` bumps the version, copies it into `.claude-plugin/plugin.json`, dates the changelog section, commits, and tags `v<version>`.
3. `git push origin main --follow-tags`
4. `gh release create v<version> --title v<version> --notes "$(node tools/version.mjs --notes)"`
5. `npm publish` (lists the package in the pi.dev gallery through its `pi-package` keyword).

`npm run check` must pass first; CI runs it on every push.
