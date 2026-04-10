import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import select from "@inquirer/select";

interface ClaudeSettings {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  [key: string]: unknown;
}

const PROMPTLY_CLAUDE_MD = `# Promptly — Automatic Prompt Refinement

You have access to Promptly MCP tools. These are MANDATORY for all coding tasks.

## Rules (non-negotiable)

Before writing ANY code, creating ANY file, or making ANY change, you MUST follow this exact sequence:

1. Call the \`analyze_codebase\` MCP tool with the project root path as \`project_path\`.
2. Take the JSON output from step 1 and pass it as \`codebase_context\` to the \`refine_prompt\` MCP tool, along with the user's original prompt as \`raw_prompt\`.
3. Read the \`refined_prompt\` from the response.
4. Execute the refined prompt instead of the original.

## When to use

ALWAYS use for: creating files, writing code, fixing bugs, refactoring, adding features, configuring tools, updating dependencies, writing tests, explaining code.

NEVER use for: general conversation, math, non-coding questions.

## Important

- Do NOT skip these tools to save time. The refinement adds critical project context.
- Do NOT proceed with coding before completing both tool calls.
- After refinement, start your response with "✦ Refined by Promptly" on its own line.
- If a tool call fails, proceed with the original prompt but note the failure.
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
