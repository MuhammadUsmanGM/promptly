import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export async function status() {
  const settingsPath = join(homedir(), ".claude", "settings.json");

  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);

    if (settings.mcpServers?.["promptly"]) {
      console.log("");
      console.log("  ✦ Promptly is configured");
      console.log(`    Command: ${settings.mcpServers["promptly"].command}`);
      console.log(`    Args:    ${(settings.mcpServers["promptly"].args ?? []).join(" ")}`);
      console.log(`    Config:  ${settingsPath}`);
      console.log("");
    } else {
      console.log("");
      console.log("  ✦ Promptly is not configured. Run: promptly init");
      console.log("");
    }
  } catch {
    console.log("");
    console.log("  ✦ No Claude Code settings found. Run: promptly init");
    console.log("");
  }
}
