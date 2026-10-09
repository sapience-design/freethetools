# How to use the tools with an AI assistant

Connect your assistant to the `freethetools` package. It then compresses, merges and splits PDFs, and does other file jobs, on your computer. Your files are never uploaded.

You need [Node.js](https://nodejs.org) 22 or later.

## Claude Code

1. Open a terminal.
2. Run `claude mcp add freethetools -- npx -y freethetools mcp`.
3. To use it in every project, run `claude mcp add --scope user freethetools -- npx -y freethetools mcp` instead.
4. Run `claude mcp list` and check that `freethetools` is listed.
5. Ask for a job, for example: "Compress report.pdf."

## Claude Desktop

Claude Desktop does not run in your project folder, so it cannot find a short path such as `report.pdf`. Always tell it the full path, for example `C:\Users\you\Documents\report.pdf` or `/Users/you/Documents/report.pdf`.

1. Open the Claude menu, then Settings, then Developer.
2. Select Edit Config. This opens `claude_desktop_config.json`.
3. Add the block below. If the file already has `mcpServers`, add only the `freethetools` entry.
4. Save the file and restart Claude Desktop.
5. Ask for a job with full paths, for example: "Merge C:\Users\you\Documents\a.pdf and C:\Users\you\Documents\b.pdf."

```json
{
  "mcpServers": {
    "freethetools": {
      "command": "npx",
      "args": ["-y", "freethetools", "mcp"]
    }
  }
}
```

On Windows, if the app cannot start `npx`, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "freethetools", "mcp"]`.

## Cursor

1. Open `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` in one project. Create the file if it does not exist.
2. Add the same `mcpServers` block as for Claude Desktop.
3. Restart Cursor, or reload MCP servers in its settings.

## Another MCP client

1. Find where the client lists local (stdio) servers.
2. Set the command to `npx` and the arguments to `-y freethetools mcp`.
3. Restart the client.

## An assistant without MCP

1. Let the assistant run commands in a terminal.
2. Tell it to run `npx -y freethetools list` to see the tools.
3. Tell it to run `npx -y freethetools run <tool> '<json>'` to use one, for example `npx -y freethetools run merge_pdfs '{"files":["a.pdf","b.pdf"]}'`.

## Find the results

1. Open the `freethetools` folder in your home folder. Results are in `files/`, one folder for each job.
2. Open `library.jsonl` to see every job, including failed ones.
3. To use another folder, add `--library <folder>` to the command, or set the `FREETHETOOLS_LIBRARY` environment variable.
4. To see the folder as a list, open the library page on freethetools.com in Chrome or Edge and choose the folder.

## Save results in another folder

Each tool that makes files also takes `saveTo`, a folder where the results are saved as well. Existing files are never overwritten. Results are always saved in the library too.

`saveTo` must point inside one of these folders:

- The working directory. In Claude Desktop this is not your project, so use the next option.
- The library folder.
- A folder you allow with `--allow-save`.

To allow a folder:

1. Add `--allow-save <folder>` after `mcp` in the command. Repeat it for more folders. In Claude Code, for example, run `claude mcp add freethetools -- npx -y freethetools mcp --allow-save ~/Documents/results`.
2. In a JSON config, add the two words to `args`: `["-y", "freethetools", "mcp", "--allow-save", "C:\\Users\\you\\Documents\\results"]`.
3. Or set the `FREETHETOOLS_ALLOW_SAVE` environment variable to a list of folders, separated by `;` on Windows and `:` elsewhere.
4. Restart the assistant.

The package refuses to save into a hidden folder (a name starting with a dot, such as `.git/hooks`). It also refuses file names that can run a program, such as `.bat`, `.exe` or `.sh`, and names without an extension.

## What the assistant cannot read

The package never reads hidden files or files in hidden folders, such as `~/.ssh`, `.env` and `.git`. A tool returns at most 1 MB of text or data in the conversation. Larger data is saved in the library, and the result gives the path. [Safety](../../packages/freethetools/README.md#safety) has the full rules.

## Tools in the browser

1. Open a tool page in a browser and with an assistant that supports WebMCP. Chrome and Edge support it in origin trials.
2. Ask the assistant to use the tool on the page. The page offers its tool to the assistant. The files stay in the browser.

Other browsers ignore WebMCP, and the page works as usual.

## Related

- [Decision record 8](../adr/0008-tools-for-ai-agents.md): why there are two channels and no hosted server
- [Package README](../../packages/freethetools/README.md): safety rules, limits, the folder layout and licences
