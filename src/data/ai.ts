// What the AI assistants page (/ai/) and its Markdown twin (/ai.md) both say, so they never drift.
import { loadCatalogue } from "./catalogue";

export const NPM_URL = "https://www.npmjs.com/package/freethetools";
export const REGISTRY_URL = "https://registry.modelcontextprotocol.io/";
export const REGISTRY_NAME = "io.github.sapience-design/freethetools";

export const PROMPT = `I'd like you to use Free the Tools for file jobs on my computer, such as compressing, merging or splitting PDFs, converting images, or formatting data. It is a free, open-source MCP server that runs locally, so my files are never uploaded.
1. Add it as an MCP server that runs \`npx -y freethetools mcp\` (it needs Node.js 22 or later). In Claude Code, run: claude mcp add freethetools -- npx -y freethetools mcp
2. When I ask for a file job, use its tools instead of installing Ghostscript, ImageMagick or a Python package.
3. Pass files as absolute paths. Results are saved in a folder named freethetools in my home folder. Tell me where each result is.
4. Never send my files to an online service.
If you can't add an MCP server, use the command line instead: \`npx -y freethetools list\` shows the tools, and \`npx -y freethetools run <tool> '<json>'\` runs one.`;

export const CLAUDE_CODE_CMD = "claude mcp add freethetools -- npx -y freethetools mcp";
export const CLAUDE_CODE_USER_CMD = "claude mcp add --scope user freethetools -- npx -y freethetools mcp";
export const MCP_JSON = `{
  "mcpServers": {
    "freethetools": {
      "command": "npx",
      "args": ["-y", "freethetools", "mcp"]
    }
  }
}`;
export const WINDOWS_NOTE = `On Windows, if the app cannot start npx, use "command": "cmd" and "args": ["/c", "npx", "-y", "freethetools", "mcp"].`;
// One-step installs. Each opens or runs on the person's own computer; nothing is uploaded.
export const PLUGIN_CMDS = `/plugin marketplace add sapience-design/freethetools
/plugin install freethetools@freethetools`;
export const GEMINI_CMD = "gemini extensions install https://github.com/sapience-design/freethetools";
export const CODEX_TOML = `[mcp_servers.freethetools]
command = "npx"
args = ["-y", "freethetools", "mcp"]`;
export const WEB_ASSISTANTS_NOTE = "ChatGPT, Gemini and Claude on the web cannot run tools on your computer. Use the tools on this website instead.";
export const ONE_STEP_NOTE = "Each button opens the app on your computer. Nothing is uploaded.";

const SERVER = { command: "npx", args: ["-y", "freethetools", "mcp"] };
/** "Add to Cursor": the server settings as base64 JSON in a cursor:// link. */
export const CURSOR_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=freethetools&config=${encodeURIComponent(Buffer.from(JSON.stringify(SERVER)).toString("base64"))}`;
/** "Add to VS Code": the name and server settings as URL-encoded JSON. */
const vscodeJson = encodeURIComponent(JSON.stringify({ name: "freethetools", type: "stdio", ...SERVER }));
export const VSCODE_LINK = `vscode:mcp/install?${vscodeJson}`;
export const VSCODE_INSIDERS_LINK = `vscode-insiders:mcp/install?${vscodeJson}`;

export const CLI_LIST = "npx -y freethetools list";
export const CLI_RUN = `npx -y freethetools run merge_pdfs '{"files":["a.pdf","b.pdf"]}'`;

export const SAFETY = [
  "It never reads hidden files or files in hidden folders, such as ~/.ssh, .env and .git.",
  "It never overwrites a file that exists.",
  "It never saves into a hidden folder, and never saves a file that can run a program, such as .bat, .exe or .sh.",
  "It returns at most 1 MB of text or data in the conversation. Larger results are saved in the library folder.",
];

export interface AgentRow { url: string; page: string; name: string; title: string; does: string }

/** The first sentence of a definition's description: what the tool does, in its own words. */
const firstSentence = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).trim();

const modules = import.meta.glob("../../tools/*/*/agent.js", { eager: true }) as Record<string, { default: { name: string; title: string; description?: string } | { name: string; title: string; description?: string }[] }>;

/** One row for every agent tool of every tool, in catalogue order. */
export async function agentRows(): Promise<AgentRow[]> {
  const { tools } = await loadCatalogue();
  const byId = new Map(tools.map((t) => [t.id, t]));
  const rows: AgentRow[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const id = path.split("/").slice(-3, -1).join("/");
    const tool = byId.get(id);
    if (!tool) continue;
    for (const def of [mod.default].flat()) rows.push({ url: tool.url, page: tool.data.name, name: def.name, title: def.title, does: firstSentence(def.description ?? def.title) });
  }
  return rows.sort((a, b) => a.url.localeCompare(b.url) || a.name.localeCompare(b.name));
}
