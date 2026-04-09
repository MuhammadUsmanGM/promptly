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

// src/cli/banner.ts
var VERSION = "1.0.0";
var REPO = "https://github.com/MuhammadUsmanGM/promptly";
var BANNER = `
\x1B[38;5;179m\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557   \u2588\u2588\u2557\x1B[0m
\x1B[38;5;173m\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2551  \u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\x1B[0m
\x1B[38;5;137m\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   \u2588\u2588\u2551   \u255A\u2588\u2588\u2588\u2588\u2554\u255D \x1B[0m
\x1B[38;5;173m\u2588\u2588\u2554\u2550\u2550\u2550\u255D \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u255D    \u2588\u2588\u2551   \u2588\u2588\u2551    \u255A\u2588\u2588\u2554\u255D  \x1B[0m
\x1B[38;5;179m\u2588\u2588\u2551     \u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2551        \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551   \x1B[0m
\x1B[38;5;222m\u255A\u2550\u255D     \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u255D        \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D   \x1B[0m

\x1B[90m  your prompt, refined before it lands\x1B[0m
\x1B[90m  v${VERSION} \xB7 ${REPO}\x1B[0m
`;
function printBanner() {
  console.log(BANNER);
}

// src/cli/index.ts
import { getRulesDescription } from "@promptly/rules";
async function runCli(args) {
  const command = args[0];
  switch (command) {
    case "init":
      printBanner();
      await init();
      break;
    case "mcp": {
      const { startStdioServer } = await import("./mcp/server.js");
      await startStdioServer();
      break;
    }
    case "status":
      printBanner();
      await status();
      break;
    case "rules": {
      printBanner();
      const agent = args[1] ?? "claude_code";
      const rules = getRulesDescription(agent);
      console.log(`  \x1B[1mRefinement Rules\x1B[0m \x1B[90m(${agent})\x1B[0m`);
      console.log("");
      console.log(rules);
      console.log("");
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case void 0:
      printBanner();
      printHelp();
      break;
    case "--version":
    case "-v":
      console.log(VERSION);
      break;
    default:
      printBanner();
      console.error(`  \x1B[31mUnknown command: ${command}\x1B[0m`);
      console.log("");
      printHelp();
      process.exit(1);
  }
}
function printHelp() {
  console.log(`  \x1B[1mUsage:\x1B[0m

    promptly init          Set up Promptly for Claude Code
    promptly mcp           Start MCP server (used by Claude Code)
    promptly status        Check if Promptly is configured
    promptly rules [agent] Print refinement rules
    promptly --version     Print version
    promptly --help        Print this help
`);
}

export {
  runCli
};
