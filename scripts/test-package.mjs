// Tests the freethetools npm package (packages/freethetools). The package has its own dependencies
// (the MCP SDK), so install them first if they are missing, then build the package and run its tests.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../packages/freethetools/", import.meta.url));
const run = (cmd) => execSync(cmd, { cwd: dir, stdio: "inherit" });

if (!existsSync(`${dir}node_modules/@modelcontextprotocol/sdk`)) run("npm ci --no-audit --no-fund");
run("npm test");
