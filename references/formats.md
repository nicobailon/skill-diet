# Formats

Write cheat sheet lines and hard shapes in the syntax the agent types to call the tool:

| The agent calls the tool through | Write |
| --- | --- |
| a shell (a CLI, or `curl` for an HTTP API) | the usage line: `select <ref> <value>… [--by value\|label\|index]` |
| code (code mode, an SDK) | a TypeScript signature: `select(ref: string, values: string[], opts?: { by?: "value" \| "label" \| "index" })` |
| a native or MCP tool call | the call's JSON shape: `{agent, task, async?: true}` |

Usage-line notation:

```text
<arg>          required positional
[--flag <v>]   optional flag with a value; [--switch] has none
a|b|c          allowed values
<ms>=20000     default
…              repeatable
x | y          alternative forms of one command
# note         what the line can't show
```

Cost of the same content, measured on surf v2.23.0 (131 commands, all 292 flags, names only, o200k tokens):

```text
usage lines        1,734
markdown table     2,626   one row per command
TypeScript         2,718
JSON Schema        4,863   MCP tools/list shape
OpenAPI JSON       8,160
OpenAPI YAML       9,784
names-only index     347   grouped, one line per group
```

Machine formats wrap every command in the same boilerplate (`paths`, `requestBody`, `content`, `schema`). A table repeats its pipes and loses the call syntax the agent has to type.

One of each part:

```text
cheat sheet   wait.ready [--selector <css>] [--text <t>] [--accept login,challenge,…] [--timeout <ms>=20000]
hard shape    surf form.fill --data '[{"ref":"e1","value":"John"},{"ref":"e7","value":true}]'
index         tab: tab.list tab.new tab.switch tab.close tab.move tab.reload tab.name tab.group
```
