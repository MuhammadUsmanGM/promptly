import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

interface ClaudeConfig {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
}

export async function init() {
  console.log("");
  console.log("  ✦ Welcome to Promptly");
  console.log("");
  console.log("  Promptly adds a refinement layer to Claude Code.");
  console.log("  Claude itself does the refinement — no extra API key needed.");
  console.log("");

  const claudeDir = join(homedir(), ".claude");
  const configPath = join(claudeDir, "claude_desktop_config.json");

  // Read existing config or create new
  let config: ClaudeConfig = {};
  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // No existing config
  }

  if (!config.mcpServers) config.mcpServers = {};

  if (config.mcpServers["promptly"]) {
    console.log("  ✦ Promptly is already configured in Claude Code.");
    console.log("");
    return;
  }

  config.mcpServers["promptly"] = {
    command: "promptly",
    args: ["mcp"],
  };

  await mkdir(claudeDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");

  console.log("  ✦ Added Promptly to Claude Code config.");
  console.log(`  ✦ Written to ${configPath}`);
  console.log("");
  console.log("  ✦ Done. Restart Claude Code and Promptly will be active.");
  console.log("    You will see Promptly's tools in your MCP connections.");
  console.log("");
}
