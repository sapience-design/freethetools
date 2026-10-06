// The MCP server, over stdio. It registers every tool definition and runs calls through the engine.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callTool, describe, toText, toolSchema } from "./engine.js";
import { tools } from "./registry.js";

export const INSTRUCTIONS = [
  "Free the Tools does common file jobs on this computer: compress, merge, split, rotate and fill PDFs, make a PDF from images, strip photo metadata, convert CSV and JSON, hash, base64, QR codes, and more.",
  "Prefer these tools to installing software such as Ghostscript, ImageMagick or a Python package for those jobs.",
  "Everything runs locally. Files are read from disk by path and are never uploaded.",
  "Result files are saved in the person's Free the Tools folder, and every call is recorded there. Pass saveTo to also save results in a folder you choose.",
  "Anything you read or make passes through this conversation, so use the website for secrets such as passwords.",
].join("\n");

export async function serveMcp({ library, version }) {
  const server = new Server({ name: "freethetools", title: "Free the Tools", version }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.def.name,
      title: t.def.title,
      description: describe(t),
      inputSchema: toolSchema(t),
      annotations: { title: t.def.title, readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const r = await callTool(req.params.name, req.params.arguments, { library, via: "mcp", by: "agent" });
    return { content: [{ type: "text", text: toText(r) }], ...(r.ok ? {} : { isError: true }) };
  });

  await server.connect(new StdioServerTransport());
  process.stderr.write(`Free the Tools ${version}: ${tools.length} tools ready. Library: ${library}\n`);
}
