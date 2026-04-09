import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import select from "@inquirer/select";

interface ClaudeSettings {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  [key: string]: unknown;
}

const PROMPTLY_CLAUDE_MD = `# Promptly — Automatic Prompt Refinement

When the user sends a coding-related prompt (write, fix, refactor, explain, build, configure, deploy), you MUST:

1. First call \`analyze_codebase\` with the project root path to get structured context about the tech stack, conventions, file structure, and dependencies.
2. Then call \`refine_prompt\` with the original prompt and the codebase context to get a refined, context-aware version.
3. Execute the refined prompt, not the original.

Do NOT call these tools for general questions, math, writing, or casual chat.

When you use Promptly, briefly note "✦ Refined by Promptly" before your response.
`;

export async function init() {
  console.log("");
  console.log("  ✦ Welcome to Promptly");
  console.log("");
  console.log("  Promptly adds a refinement layer to Claude Code.");
  console.log("  Claude itself does the refinement — no extra API key needed.");
  console.log("");

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
  } catch {
    // No existing settings
  }

  if (!settings.mcpServers) settings.mcpServers = {};

  if (!settings.mcpServers["promptly"]) {
    settings.mcpServers["promptly"] = {
      command: "promptly",
      args: ["mcp"],
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
