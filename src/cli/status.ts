import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const home = homedir();

// All locations to check for MCP config and instruction files
const AGENT_CHECKS = [
  {
    label: "Claude Code",
    mcpPaths: [join(home, ".claude", "settings.json")],
    instructionPaths: [
      { path: join(home, ".claude", "CLAUDE.md"), label: "global CLAUDE.md" },
      { path: join(process.cwd(), "CLAUDE.md"), label: "project CLAUDE.md" },
    ],
  },
  {
    label: "Cursor",
    mcpPaths: [
      join(home, ".cursor", "mcp.json"),
      join(process.cwd(), ".cursor", "mcp.json"),
    ],
    instructionPaths: [
      { path: join(process.cwd(), ".cursorrules"), label: ".cursorrules" },
    ],
  },
  {
    label: "Gemini CLI",
    mcpPaths: [
      join(home, ".gemini", "settings.json"),
      join(process.cwd(), ".gemini", "settings.json"),
    ],
    instructionPaths: [
      { path: join(home, ".gemini", "GEMINI.md"), label: "global GEMINI.md" },
      { path: join(process.cwd(), "GEMINI.md"), label: "project GEMINI.md" },
    ],
  },
  {
    label: "Qwen Code",
    mcpPaths: [
      join(home, ".qwen", "settings.json"),
      join(process.cwd(), ".qwen", "settings.json"),
    ],
    instructionPaths: [
      { path: join(home, ".qwen", "QWEN.md"), label: "global QWEN.md" },
      { path: join(process.cwd(), "QWEN.md"), label: "project QWEN.md" },
    ],
  },
];

interface McpResult {
  found: boolean;
  path?: string;
  command?: string;
  args?: string[];
}

async function checkMcpConfig(path: string): Promise<McpResult> {
  try {
    const raw = await readFile(path, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.mcpServers?.["promptly"]) {
      const entry = settings.mcpServers["promptly"];
      return {
        found: true,
        path,
        command: entry.command,
        args: Array.isArray(entry.args) ? entry.args : [],
      };
    }
  } catch {
    // File doesn't exist or invalid
  }
  return { found: false };
}

async function fileContains(path: string, search: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf-8");
    return content.includes(search);
  } catch {
    return false;
  }
}

// --- Data collection (shared by human + JSON paths) ---------------------------

export interface AgentStatus {
  agent: string;
  mcp: {
    found: boolean;
    path?: string;
    command?: string;
    args?: string[];
  };
  instructions: {
    found: boolean;
    path?: string;
    label?: string;
  };
}

async function collectStatus(): Promise<AgentStatus[]> {
  return Promise.all(AGENT_CHECKS.map(async (agent) => {
    let mcp: McpResult = { found: false };
    for (const mcpPath of agent.mcpPaths) {
      const result = await checkMcpConfig(mcpPath);
      if (result.found) { mcp = result; break; }
    }

    const instructions: AgentStatus["instructions"] = { found: false };
    for (const { path, label } of agent.instructionPaths) {
      if (await fileContains(path, "Promptly")) {
        instructions.found = true;
        instructions.path = path;
        instructions.label = label;
        break;
      }
    }

    return {
      agent: agent.label,
      mcp: {
        found: mcp.found,
        ...(mcp.path ? { path: mcp.path } : {}),
        ...(mcp.command ? { command: mcp.command } : {}),
        ...(mcp.args ? { args: mcp.args } : {}),
      },
      instructions,
    };
  }));
}

// --- Flag parsing ---

export interface StatusOptions {
  json: boolean;
}

export function parseStatusFlags(args: string[]): StatusOptions {
  const opts: StatusOptions = { json: false };
  for (const arg of args) {
    if (arg === "--json") opts.json = true;
    else {
      console.error(`Error: unknown flag "${arg}"`);
      process.exit(1);
    }
  }
  return opts;
}

// --- Main ---

export async function status(opts: StatusOptions = { json: false }): Promise<void> {
  const results = await collectStatus();

  if (opts.json) {
    // Machine-readable — filter to configured agents only, same policy as the
    // human view. Scripts that want *all* agents can compute it from doctor
    // instead; status is "what's wired" by design.
    const configured = results.filter((r) => r.mcp.found || r.instructions.found);
    process.stdout.write(JSON.stringify({ configured }, null, 2) + "\n");
    return;
  }

  printHuman(results);
}

function printHuman(results: AgentStatus[]): void {
  console.log("");

  const configured = results.filter((r) => r.mcp.found || r.instructions.found);

  if (configured.length === 0) {
    console.log("  No agents configured. Run: promptly init");
    console.log("");
    return;
  }

  for (const r of configured) {
    console.log(`  \x1b[1m${r.agent}\x1b[0m`);

    if (r.mcp.found) {
      const detail = `${r.mcp.command ?? ""} ${(r.mcp.args ?? []).join(" ")}`.trim();
      console.log(`  \x1b[32m✔\x1b[0m MCP server configured (${detail})`);
    } else {
      console.log("  \x1b[31m✖\x1b[0m MCP server not configured");
    }

    if (r.instructions.found) {
      console.log(`  \x1b[32m✔\x1b[0m Instructions found in ${r.instructions.label}`);
    } else {
      console.log("  \x1b[31m✖\x1b[0m No Promptly instructions found");
    }

    console.log("");
  }

  console.log("  ✦ Run \x1b[1mpromptly init\x1b[0m to set up additional agents.");
  console.log("");
}
