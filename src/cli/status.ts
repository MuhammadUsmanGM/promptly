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
];

async function checkMcpConfig(path: string): Promise<{ found: boolean; command?: string; args?: string }> {
  try {
    const raw = await readFile(path, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.mcpServers?.["promptly"]) {
      return {
        found: true,
        command: settings.mcpServers["promptly"].command,
        args: (settings.mcpServers["promptly"].args ?? []).join(" "),
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

export async function status() {
  console.log("");

  let anyConfigured = false;

  for (const agent of AGENT_CHECKS) {
    let mcpFound = false;
    let mcpDetail = "";

    // Check all MCP config locations
    for (const mcpPath of agent.mcpPaths) {
      const result = await checkMcpConfig(mcpPath);
      if (result.found) {
        mcpFound = true;
        mcpDetail = `${result.command} ${result.args}`;
        break;
      }
    }

    // Check all instruction file locations
    let instructionsFound = false;
    let instructionsLabel = "";
    for (const { path, label } of agent.instructionPaths) {
      if (await fileContains(path, "Promptly")) {
        instructionsFound = true;
        instructionsLabel = label;
        break;
      }
    }

    // Only show agents that have at least one thing configured
    if (!mcpFound && !instructionsFound) continue;

    anyConfigured = true;
    console.log(`  \x1b[1m${agent.label}\x1b[0m`);

    if (mcpFound) {
      console.log(`  \x1b[32m✔\x1b[0m MCP server configured (${mcpDetail})`);
    } else {
      console.log("  \x1b[31m✖\x1b[0m MCP server not configured");
    }

    if (instructionsFound) {
      console.log(`  \x1b[32m✔\x1b[0m Instructions found in ${instructionsLabel}`);
    } else {
      console.log("  \x1b[31m✖\x1b[0m No Promptly instructions found");
    }

    console.log("");
  }

  if (!anyConfigured) {
    console.log("  No agents configured. Run: promptly init");
    console.log("");
    return;
  }

  console.log("  ✦ Run \x1b[1mpromptly init\x1b[0m to set up additional agents.");
  console.log("");
}
