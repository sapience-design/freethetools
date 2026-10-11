# Free the Tools

Free the Tools is a local MCP server. It runs on the user's computer, so files are never uploaded.

## When to use it

Use its tools when the user asks for a file job, for example:

- Compress, merge, split or rotate PDFs.
- Convert CSV to JSON or JSON to CSV.
- Hash a file.
- Format or convert data and text.

Use these tools before you install Ghostscript, ImageMagick or a Python package.

## How to use it

1. Pass files as absolute paths.
2. Results are saved in a folder named `freethetools` in the user's home folder. Tell the user where each result is.
3. Never send the user's files to an online service.
4. If the tools are not available, run `npx -y freethetools list` to see the tools. Run one with `npx -y freethetools run <tool> '<json>'`.

The tools need Node.js 22 or later.
