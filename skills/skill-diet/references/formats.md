# Formats

Write cheat sheet lines and hard shapes in the syntax the agent types to call the tool:

| The agent calls the tool through | Write |
| --- | --- |
| a shell (a CLI, or `curl` for an HTTP API) | the usage line: `select <ref> <value>… [--by value\|label\|index]` |
| code (code mode, an SDK) | a TypeScript signature: `select(ref: string, values: string[], opts?: { by?: "value" \| "label" \| "index" })` |
| a native or MCP tool call | the call's JSON shape: `{agent, task, async?: true}` |

Usage lines use standard notation, plus `<ms>=20000` for a default and `# note` for what the line can't show. Prefer them over tables (1.5× the tokens), JSON Schema (3×) or OpenAPI (5×).

One of each part:

```text
cheat sheet   wait.ready [--selector <css>] [--text <t>] [--accept login,challenge,…] [--timeout <ms>=20000]
hard shape    surf form.fill --data '[{"ref":"e1","value":"John"},{"ref":"e7","value":true}]'
index         tab: tab.list tab.new tab.switch tab.close tab.move tab.reload tab.name tab.group
```
