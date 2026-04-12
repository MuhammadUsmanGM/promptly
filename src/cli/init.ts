import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import select from "@inquirer/select";

interface ClaudeSettings {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  [key: string]: unknown;
}

const PROMPTLY_CLAUDE_MD = `# Promptly — Automatic Prompt Refinement

Before writing ANY code, creating ANY file, or making ANY change, call the \`refine_prompt\` MCP tool with \`raw_prompt\` (the user's prompt) and \`project_path\` (the project root). Execute the returned refined prompt instead of the original.

Use for: writing, fixing, refactoring, explaining, configuring code. Skip for: general chat, math, non-coding questions.

After refinement, start your response with "✦ Refined by Promptly" on its own line.
`;

export async function init() {
  // Step 1: Ask where to store instructions
  const scope = await select({
    message: "Where should Promptly store its instructions?",
    choices: [
      {
        name: "Global (all projects)",
        value: "global" as const,
        description: "~/.claude/CLAUDE.md — Promptly is active everywhere",
      },
      {
        name: "This project only",
        value: "project" as const,
        description: "./CLAUDE.md — Promptly is active only in this directory",
      },
    ],
  });

  // Step 2: Write MCP server config to settings.json
  const claudeDir = join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  let settings: ClaudeSettings = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("  \x1b[31m✖ ~/.claude/settings.json contains invalid JSON. Please fix it manually.\x1b[0m");
      process.exit(1);
    }
    // File doesn't exist — will create fresh
  }

  if (!settings.mcpServers) settings.mcpServers = {};

  if (!settings.mcpServers["promptly"]) {
    settings.mcpServers["promptly"] = {
      command: "npx",
      args: ["-y", "@promptly-ai/cli", "mcp"],
    };

    await mkdir(claudeDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log("");
    console.log("  ✦ MCP server added to Claude Code settings.");
  } else {
    console.log("");
    console.log("  ✦ MCP server already configured.");
  }

  // Step 3: Write CLAUDE.md instructions
  if (scope === "global") {
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    let existing = "";
    try {
      existing = await readFile(claudeMdPath, "utf-8");
    } catch {
      // No existing file
    }

    if (existing.includes("Promptly")) {
      console.log("  ✦ Promptly instructions already in global CLAUDE.md.");
    } else {
      const updated = existing ? existing + "\n" + PROMPTLY_CLAUDE_MD : PROMPTLY_CLAUDE_MD;
      await writeFile(claudeMdPath, updated);
      console.log(`  ✦ Instructions written to ${claudeMdPath}`);
    }
  } else {
    const claudeMdPath = join(process.cwd(), "CLAUDE.md");
    let existing = "";
    try {
      existing = await readFile(claudeMdPath, "utf-8");
    } catch {
      // No existing file
    }

    if (existing.includes("Promptly")) {
      console.log("  ✦ Promptly instructions already in project CLAUDE.md.");
    } else {
      const updated = existing ? existing + "\n" + PROMPTLY_CLAUDE_MD : PROMPTLY_CLAUDE_MD;
      await writeFile(claudeMdPath, updated);
      console.log(`  ✦ Instructions written to ${claudeMdPath}`);
    }
  }

  console.log("");
  console.log("  ✦ Done! Restart Claude Code and Promptly will be active.");
  console.log("");
}
