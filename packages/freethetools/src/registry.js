// Every tool definition, gathered at build time from tools/*/*/agent.js.
import { tools as all } from "freethetools:tools";

/** @type {{ id: string, def: import("../../../src/agent/contract.js").AgentTool, makesFiles: boolean }[]} */
export const tools = all;
export const byName = new Map(all.map((t) => [t.def.name, t]));
