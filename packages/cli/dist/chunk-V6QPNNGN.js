// src/cli/init.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
async function init() {
  console.log("");
  console.log("  \u2726 Welcome to Promptly");
  console.log("");
  console.log("  Promptly adds a refinement layer to Claude Code.");
  console.log("  Claude itself does the refinement \u2014 no extra API key needed.");
  console.log("");
  const claudeDir = join(homedir(), ".claude");
  const configPath = join(claudeDir, "claude_desktop_config.json");
  let config = {};
  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
  }
  if (!config.mcpServers) config.mcpServers = {};
  if (config.mcpServers["promptly"]) {
    console.log("  \u2726 Promptly is already configured in Claude Code.");
    console.log("");
    return;
  }
  config.mcpServers["promptly"] = {
    command: "promptly",
    args: ["mcp"]
  };
  await mkdir(claudeDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("  \u2726 Added Promptly to Claude Code config.");
  console.log(`  \u2726 Written to ${configPath}`);
  console.log("");
  console.log("  \u2726 Done. Restart Claude Code and Promptly will be active.");
  console.log("    You will see Promptly's tools in your MCP connections.");
  console.log("");
}

// src/cli/status.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
async function status() {
  const configPath = join2(homedir2(), ".claude", "claude_desktop_config.json");
  try {
    const raw = await readFile2(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (config.mcpServers?.["promptly"]) {
      console.log("");
      console.log("  \u2726 Promptly is configured");
      console.log(`    Command: ${config.mcpServers["promptly"].command}`);
      console.log(`    Args:    ${(config.mcpServers["promptly"].args ?? []).join(" ")}`);
      console.log(`    Config:  ${configPath}`);
      console.log("");
    } else {
      console.log("");
      console.log("  \u2726 Promptly is not configured. Run: promptly init");
      console.log("");
    }
  } catch {
    console.log("");
    console.log("  \u2726 No Claude Code config found. Run: promptly init");
    console.log("");
  }
}

// src/cli/index.ts
import { getRulesDescription } from "@promptly/rules";
async function runCli(args) {
  const command = args[0];
  switch (command) {
    case "init":
      await init();
      break;
    case "mcp": {
      const { startStdioServer } = await import("./mcp/server.js");
      await startStdioServer();
      break;
    }
    case "status":
      await status();
      break;
    case "rules": {
      const agent = args[1] ?? "claude_code";
      const rules = getRulesDescription(agent);
      console.log("");
      console.log("  \u2726 Promptly Refinement Rules");
      console.log(`    Agent: ${agent}`);
      console.log("");
      console.log(rules);
      console.log("");
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case void 0:
      printHelp();
      break;
    case "--version":
    case "-v":
      console.log("1.0.0");
      break;
    default:
      console.error(`  Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}
function printHelp() {
  console.log(`
  \u2726 Promptly \u2014 Better prompts, better code

  Usage:
    promptly init          Set up Promptly for Claude Code
    promptly mcp           Start MCP server (used by Claude Code)
    promptly status        Check if Promptly is configured
    promptly rules [agent] Print refinement rules (claude_code|cursor|gemini_cli|generic)
    promptly --version     Print version
    promptly --help        Print this help
`);
}

export {
  runCli
};
