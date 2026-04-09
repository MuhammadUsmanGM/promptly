import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export async function status() {
  const configPath = join(homedir(), ".claude", "claude_desktop_config.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    if (config.mcpServers?.["promptly"]) {
      console.log("");
      console.log("  ✦ Promptly is configured");
      console.log(`    Command: ${config.mcpServers["promptly"].command}`);
      console.log(`    Args:    ${(config.mcpServers["promptly"].args ?? []).join(" ")}`);
      console.log(`    Config:  ${configPath}`);
      console.log("");
    } else {
      console.log("");
      console.log("  ✦ Promptly is not configured. Run: promptly init");
      console.log("");
    }
  } catch {
    console.log("");
    console.log("  ✦ No Claude Code config found. Run: promptly init");
    console.log("");
  }
}
