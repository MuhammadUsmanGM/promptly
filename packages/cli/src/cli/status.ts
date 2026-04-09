import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

async function fileContains(path: string, search: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf-8");
    return content.includes(search);
  } catch {
    return false;
  }
}

export async function status() {
  const claudeDir = join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  let mcpConfigured = false;
  let mcpCommand = "";
  let mcpArgs = "";

  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.mcpServers?.["promptly"]) {
      mcpConfigured = true;
      mcpCommand = settings.mcpServers["promptly"].command;
      mcpArgs = (settings.mcpServers["promptly"].args ?? []).join(" ");
    }
  } catch {
    // No settings file
  }

  const globalMd = await fileContains(join(claudeDir, "CLAUDE.md"), "Promptly");
  const projectMd = await fileContains(join(process.cwd(), "CLAUDE.md"), "Promptly");
  const hasInstructions = globalMd || projectMd;

  console.log("");

  // MCP server status
  if (mcpConfigured) {
    console.log("  \x1b[32m✔\x1b[0m MCP server configured");
    console.log(`    Command: ${mcpCommand} ${mcpArgs}`);
    console.log(`    Config:  ${settingsPath}`);
  } else {
    console.log("  \x1b[31m✖\x1b[0m MCP server not configured");
  }

  // Instructions status
  if (globalMd) {
    console.log(`  \x1b[32m✔\x1b[0m Instructions found in global CLAUDE.md`);
  } else if (projectMd) {
    console.log(`  \x1b[32m✔\x1b[0m Instructions found in project CLAUDE.md`);
  } else {
    console.log("  \x1b[31m✖\x1b[0m No Promptly instructions in CLAUDE.md");
  }

  // Overall
  console.log("");
  if (mcpConfigured && hasInstructions) {
    console.log("  ✦ Promptly is fully configured. Restart Claude Code if not active.");
  } else {
    console.log("  ✦ Setup incomplete. Run: promptly init");
  }

  console.log("");
}
