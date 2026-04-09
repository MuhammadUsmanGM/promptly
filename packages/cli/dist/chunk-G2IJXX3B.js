// src/cli/init.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import select from "@inquirer/select";
var PROMPTLY_CLAUDE_MD = `# Promptly \u2014 Automatic Prompt Refinement

When the user sends a coding-related prompt (write, fix, refactor, explain, build, configure, deploy), you MUST:

1. First call \`analyze_codebase\` with the project root path to get structured context about the tech stack, conventions, file structure, and dependencies.
2. Then call \`refine_prompt\` with the original prompt and the codebase context to get a refined, context-aware version.
3. Execute the refined prompt, not the original.

Do NOT call these tools for general questions, math, writing, or casual chat.

When you use Promptly, briefly note "\u2726 Refined by Promptly" before your response.
`;
async function init() {
  console.log("");
  console.log("  \u2726 Welcome to Promptly");
  console.log("");
  console.log("  Promptly adds a refinement layer to Claude Code.");
  console.log("  Claude itself does the refinement \u2014 no extra API key needed.");
  console.log("");
  const scope = await select({
    message: "Where should Promptly store its instructions?",
    choices: [
      {
        name: "Global (all projects)",
        value: "global",
        description: "~/.claude/CLAUDE.md \u2014 Promptly is active everywhere"
      },
      {
        name: "This project only",
        value: "project",
        description: "./CLAUDE.md \u2014 Promptly is active only in this directory"
      }
    ]
  });
  const claudeDir = join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  let settings = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
  }
  if (!settings.mcpServers) settings.mcpServers = {};
  if (!settings.mcpServers["promptly"]) {
    settings.mcpServers["promptly"] = {
      command: "promptly",
      args: ["mcp"]
    };
    await mkdir(claudeDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    console.log("");
    console.log("  \u2726 MCP server added to Claude Code settings.");
  } else {
    console.log("");
    console.log("  \u2726 MCP server already configured.");
  }
  if (scope === "global") {
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    let existing = "";
    try {
      existing = await readFile(claudeMdPath, "utf-8");
    } catch {
    }
    if (existing.includes("Promptly")) {
      console.log("  \u2726 Promptly instructions already in global CLAUDE.md.");
    } else {
      const updated = existing ? existing + "\n" + PROMPTLY_CLAUDE_MD : PROMPTLY_CLAUDE_MD;
      await writeFile(claudeMdPath, updated);
      console.log(`  \u2726 Instructions written to ${claudeMdPath}`);
    }
  } else {
    const claudeMdPath = join(process.cwd(), "CLAUDE.md");
    let existing = "";
    try {
      existing = await readFile(claudeMdPath, "utf-8");
    } catch {
    }
    if (existing.includes("Promptly")) {
      console.log("  \u2726 Promptly instructions already in project CLAUDE.md.");
    } else {
      const updated = existing ? existing + "\n" + PROMPTLY_CLAUDE_MD : PROMPTLY_CLAUDE_MD;
      await writeFile(claudeMdPath, updated);
      console.log(`  \u2726 Instructions written to ${claudeMdPath}`);
    }
  }
  console.log("");
  console.log("  \u2726 Done! Restart Claude Code and Promptly will be active.");
  console.log("");
}

// src/cli/status.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
async function status() {
  const settingsPath = join2(homedir2(), ".claude", "settings.json");
  try {
    const raw = await readFile2(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.mcpServers?.["promptly"]) {
      console.log("");
      console.log("  \u2726 Promptly is configured");
      console.log(`    Command: ${settings.mcpServers["promptly"].command}`);
      console.log(`    Args:    ${(settings.mcpServers["promptly"].args ?? []).join(" ")}`);
      console.log(`    Config:  ${settingsPath}`);
      console.log("");
    } else {
      console.log("");
      console.log("  \u2726 Promptly is not configured. Run: promptly init");
      console.log("");
    }
  } catch {
    console.log("");
    console.log("  \u2726 No Claude Code settings found. Run: promptly init");
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
