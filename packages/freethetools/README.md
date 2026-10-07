# freethetools

**Free the Tools on your own computer, for AI assistants. Your files never leave it.**

This package runs a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server and a small command line. They give an AI assistant 24 tools for everyday file jobs, such as compressing, merging, splitting and rotating PDFs, stripping location data from photos, converting CSV and JSON, and hashing. The tools are the same ones as on [freethetools.com](https://freethetools.com).

An assistant that has this server no longer needs to install Ghostscript, ImageMagick or a Python package for those jobs. The server tells it to use these tools instead.

## The privacy promise

- The server runs on your computer. It reads the files you point it at from your disk.
- It makes no network connection of its own. Nothing is uploaded and nothing is counted.
- Results are saved in a folder on your computer (see [Where results go](#where-results-go)).
- The record of every job keeps options such as a quality level or a page range. It never keeps the text you gave a tool, a password or any other secret.
- It reads and writes only what is safe for an assistant to touch (see [Safety](#safety)).
- Anything the assistant reads or makes passes through your conversation with it. Use the website, not an assistant, for secrets such as passwords.

## Set it up

You need [Node.js](https://nodejs.org) 22 or later. Nothing else is installed: `npx` fetches the package the first time.

### Claude Code

Run this once in a terminal:

```sh
claude mcp add freethetools -- npx -y freethetools mcp
```

Add `--scope user` before the name to use it in every project. Check it with `claude mcp list`.
Source: [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Claude Desktop

Claude Desktop does not run in your project folder. **Give the assistant absolute paths**, such as `C:\Users\you\Documents\report.pdf` or `/Users/you/Documents/report.pdf`. A short path such as `report.pdf` will not be found.

1. Open the Claude menu, then Settings, then Developer, then Edit Config.
2. Add this to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude`, macOS: `~/Library/Application Support/Claude`):

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

3. Restart Claude Desktop.

Source: [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers). On Windows, if the app cannot start `npx`, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "freethetools", "mcp"]`.

### Cursor

Add the same `mcpServers` block as above to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project). Source: [Cursor MCP documentation](https://cursor.com/docs/context/mcp).

### Any other MCP client

Start the server with this command and speak MCP over standard input and output (stdio):

```sh
npx -y freethetools mcp
```

## Use it without MCP

An assistant or script without MCP can use the command line:

```sh
npx -y freethetools list
npx -y freethetools run merge_pdfs '{"files":["a.pdf","b.pdf"]}'
npx -y freethetools run compress_pdf '{"file":"report.pdf","quality":"smallest","saveTo":"."}'
npx -y freethetools run convert_case '{"text":"hello world","case":"title"}'
```

`run` prints the result as JSON: `ok`, a `summary`, `data` and the `files` it saved, with their full paths. It exits with code 1 if the job failed. On Windows, put the JSON in a file and write `@args.json` instead of the JSON. Run `freethetools --help` for everything.

## The tools

Run `freethetools list` for the full list. Files are always paths on your computer, absolute or relative to the working directory.

| Job | Tools |
|---|---|
| PDF | `compress_pdf`, `merge_pdfs`, `split_pdf`, `rotate_pdf`, `images_to_pdf`, `list_pdf_form_fields`, `fill_pdf_form` |
| Photos | `remove_photo_metadata` |
| Data | `csv_to_json`, `json_to_csv`, `format_json`, `base64_encode`, `base64_decode`, `generate_hash`, `decode_jwt` |
| Developer | `test_regex`, `generate_uuids`, `generate_password`, `make_qr_code` |
| Everyday | `convert_units`, `convert_time_zone` |
| Text | `convert_case`, `compare_texts`, `count_words` |

Every tool that makes files also takes an optional `saveTo`: a folder where the results are saved as well. An existing file is never overwritten. The server adds " (2)" to the name instead. `saveTo` has rules: see [Safety](#safety).

## Where results go

| What | Where |
|---|---|
| Library folder | A folder named `Free the Tools` in your home folder |
| Another folder | `freethetools mcp --library <folder>`, or set `FREETHETOOLS_LIBRARY` |
| Result files | `<library>/files/<id>/<name>` |
| Record of every job | `<library>/library.jsonl`, one JSON record per line |

A record holds the tool, the time, the settings, the input file names and sizes, the short summary the tool returned and the result files. Failed jobs are recorded with the error.

- **Settings** are options only: yes/no switches, numbers, choices from a list, and a few short values such as a file name or a page range. Text you gave a tool, passwords, secrets (a JWT secret, a Wi-Fi password) and `saveTo` are never recorded.
- **Summaries** are one line, such as "Encoded 3 bytes." A summary can name something you typed, such as a Wi-Fi network name.
- The record never holds file contents.

In Chrome and Edge, the library page on [freethetools.com](https://freethetools.com) can open this folder, so you can see what an assistant did and get the results again. The page reads the folder in your browser; nothing is uploaded.

## Safety

An AI assistant chooses the paths and file names. The package does not trust them.

**Reading**

- It never reads a hidden file, or a file inside a hidden folder. A name that starts with a dot is hidden. This covers `~/.ssh`, `~/.aws`, `~/.gnupg`, `.env` and `.git`.
- It follows links first, so a link to a hidden file is refused too.
- Only the part of a path below your working directory, your library or your home folder is checked. A project inside a folder such as `.work` still works.
- A tool returns at most 1 MB of text or data in the conversation. Larger data is saved as a file in the library, and the result gives the path.

**Saving with `saveTo`**

`saveTo` may only point to a folder inside one of these:

1. The working directory. This does not apply when the working directory is your home folder or the top of a drive.
2. The library folder.
3. A folder you allow with `--allow-save <folder>`. Repeat the option for more folders. You can also set `FREETHETOOLS_ALLOW_SAVE` to a list of folders, separated by `;` on Windows and `:` elsewhere.

`saveTo` may not go into a hidden folder, such as `.git/hooks`. It follows links first, so a link cannot lead outside the allowed folders.

To allow a folder in Claude Code:

```sh
claude mcp add freethetools -- npx -y freethetools mcp --allow-save ~/Documents/results
```

**File names**

- The package never saves a file whose name starts with a dot, or has no extension.
- It never saves a file that can run a program or start by itself: `.bat .cmd .com .exe .dll .msi .ps1 .psm1 .vbs .vbe .js .jse .wsf .wsh .hta .scr .pif .lnk .url .reg .sh .bash .zsh .command .desktop .app .jar .py .rb .pl`.
- This holds for the library as well. The error names the file and asks for another name.

## Limits

- Each call stops after 60 seconds, and after 5 minutes for `compress_pdf`. This stops a runaway job from hanging the server.
- A call may read up to 2 GB of input files. Larger files are refused.
- Password-protected PDFs must be unlocked first.
- Image Compress, Convert and Resize, and PDF to Images, are not in the package yet. They need an image engine that runs in Node.

## How compress_pdf works

`compress_pdf` runs [Ghostscript](https://ghostscript.com) compiled to WebAssembly (`@jspawn/ghostscript-wasm`). The WebAssembly file ships inside this package (about 16 MB), so it needs no download and no Ghostscript on your computer.

## Licence

AGPL-3.0-only, like the website. The source is at [github.com/sapience-design/freethetools](https://github.com/sapience-design/freethetools/tree/main/packages/freethetools). Third-party code is listed in `NOTICE`.

A [Sapience](https://sapience.design) initiative.
