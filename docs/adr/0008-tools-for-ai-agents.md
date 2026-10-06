# 8. Tools for AI agents, and a library of what they did

Date: 2026-10-06 · Status: accepted (decided by Sapience Design)

## Context

AI assistants often install software to do a file job: Ghostscript to compress a PDF, ImageMagick to convert a photo, a Python package to merge PDFs. That is slow, varies by machine, and runs code the user never chose. Free the Tools already does these jobs without uploading anything.

The owner wants AI assistants to use Free the Tools instead. The owner also wants a record of every job, so a person can see what an agent did and get the results again.

## Decision

**One definition per tool, for every channel.** Each tool folder may have an `agent.js`. It exports one or more definitions: a name, a title, a description, a JSON Schema for the inputs, and a `run` function built on the tool's `core.js`. The contract is in `src/agent/contract.js`:

- A definition never touches the page, the disk or the network.
- A file input is `{ type: "string", format: "file" }` in the schema. `run` receives it as `{ name, type, bytes }`.
- `run` returns `{ summary, data?, files? }`.
- Text in gives text out; a file in gives a file out.
- An engine that a channel must load in its own way, such as Ghostscript, is lent to `run` through a context object.

**Two channels, both keeping files on the device:**

| Channel | For | How files arrive |
|---|---|---|
| WebMCP on each tool page (`document.modelContext.registerTool`) | AI agents in the browser: Chrome and Edge (origin trials), ChatGPT Desktop, Brave | Files the person added to the page, or small files passed in the call |
| An MCP server in the npm package `freethetools` | Claude Code, Claude Desktop, Cursor and other MCP clients | Paths on the person's computer |

**No hosted MCP server.** A server on freethetools.com would need no install, but the agent would have to upload the files. That breaks the promise.

**A library of every job, on the device.**

- Every job is recorded, whether a person or an agent ran it. The library is on by default, shown in the sidebar, and easy to clear.
- Each record keeps the tool, the time, who ran it, the settings, the input names and sizes, and the result files.
- The site keeps records in the browser (IndexedDB).
- The package keeps them in a "Free the Tools" folder in the person's home folder: `library.jsonl`, one record per line, and result files under `files/<id>/`.
- Both use one format, `src/agent/library.js`. In Chrome and Edge, the site's library page can open the package's folder.

## Consequences

- The first version covers 21 tool folders and 24 agent tools. Image Compress, Convert and Resize, and PDF to Images, use the browser's canvas. They join once they have a WebAssembly image engine that also runs in Node.
- `npm test` checks every definition, runs it, and checks the library format.
- WebMCP needs origin-trial tokens in Chrome and Edge until it ships. Without a token, or in other browsers, the registration code does nothing.
- Result files use the device's storage. The library shows the space used, and records can be deleted one by one or all at once.
- Anything an agent reads or makes, including a generated password, passes through the AI conversation. The password tool's description says so and points to the page for secrets.
- Agent jobs are not yet counted in the anonymous totals of [ADR 0007](0007-visits-and-outcomes.md). Counting them needs its own decision.
- The package is AGPL-3.0, like the site. Publishing it to npm and listing it in the MCP Registry are owner tasks.
