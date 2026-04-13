import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import select from "@inquirer/select";

// --- Agent definitions ---

type AgentId = "claude_code" | "cursor" | "gemini_cli" | "qwen_code";

interface AgentConfig {
  label: string;
  mcpConfig: { global: string; project?: string };
  instructions: { global?: string; project: string };
  restartMsg: string;
}

const home = homedir();

const AGENTS: Record<AgentId, AgentConfig> = {
  claude_code: {
    label: "Claude Code",
    mcpConfig: { global: join(home, ".claude", "settings.json") },
    instructions: { global: join(home, ".claude", "CLAUDE.md"), project: "CLAUDE.md" },
    restartMsg: "Restart Claude Code and Promptly will be active.",
  },
  cursor: {
    label: "Cursor",
    mcpConfig: { global: join(home, ".cursor", "mcp.json"), project: join(".cursor", "mcp.json") },
    instructions: { project: ".cursorrules" },
    restartMsg: "Restart Cursor and Promptly will be active.",
  },
  gemini_cli: {
    label: "Gemini CLI",
    mcpConfig: { global: join(home, ".gemini", "settings.json"), project: join(".gemini", "settings.json") },
    instructions: { global: join(home, ".gemini", "GEMINI.md"), project: "GEMINI.md" },
    restartMsg: "Restart Gemini CLI and Promptly will be active.",
  },
  qwen_code: {
    label: "Qwen Code",
    mcpConfig: { global: join(home, ".qwen", "settings.json"), project: join(".qwen", "settings.json") },
    instructions: { global: join(home, ".qwen", "QWEN.md"), project: "QWEN.md" },
    restartMsg: "Restart Qwen Code and Promptly will be active.",
  },
};

// --- Shared instruction content ---

const PROMPTLY_INSTRUCTIONS = `# Promptly — Automatic Prompt Refinement

Before writing ANY code, creating ANY file, or making ANY change, call the \`refine_prompt\` MCP tool with \`raw_prompt\` (the user's prompt) and \`project_path\` (the project root). Execute the returned refined prompt instead of the original.

Use for: writing, fixing, refactoring, explaining, configuring code. Skip for: general chat, math, non-coding questions.

After refinement, start your response with "✦ Refined by Promptly" on its own line.
`;

// --- Helpers ---

async function writeMcpConfig(configPath: string): Promise<boolean> {
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf-8");
    settings = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`  \x1b[31m✖ ${configPath} contains invalid JSON. Please fix it manually.\x1b[0m`);
      process.exit(1);
    }
    // File doesn't exist — will create fresh
  }

  if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
    settings.mcpServers = {};
  }

  const servers = settings.mcpServers as Record<string, unknown>;

  if (servers["promptly"]) {
    console.log("  ✦ MCP server already configured.");
    return false;
  }

  servers["promptly"] = {
    command: "npx",
    args: ["-y", "@promptly-ai/cli", "mcp"],
  };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(settings, null, 2) + "\n");
  console.log("  ✦ MCP server added to settings.");
  return true;
}

async function writeInstructionFile(filePath: string): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf-8");
  } catch {
    // No existing file
  }

  if (existing.includes("Promptly")) {
    console.log(`  ✦ Promptly instructions already in ${filePath}`);
    return;
  }

  const updated = existing ? existing + "\n" + PROMPTLY_INSTRUCTIONS : PROMPTLY_INSTRUCTIONS;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, updated);
  console.log(`  ✦ Instructions written to ${filePath}`);
}

// --- Main init ---

export async function init() {
  // Loop so "← Back" at step 2 returns to step 1
  while (true) {
    // Step 1: Select agent
    let agentId: AgentId;
    try {
      agentId = await select<AgentId>({
        message: "Which AI coding agent are you using?",
        choices: [
          { name: "Claude Code", value: "claude_code", description: "Anthropic's CLI agent" },
          { name: "Cursor", value: "cursor", description: "AI-powered code editor" },
          { name: "Gemini CLI", value: "gemini_cli", description: "Google's CLI agent" },
          { name: "Qwen Code", value: "qwen_code", description: "Alibaba's CLI agent" },
        ],
      });
    } catch {
      // Ctrl+C — exit gracefully
      console.log("\n  \x1b[90m✦ Setup cancelled.\x1b[0m\n");
      return;
    }

    const agent = AGENTS[agentId];

    // Step 2: Select scope (Esc goes back to step 1)
    const hasGlobalInstructions = !!agent.instructions.global;
    const hasProjectMcp = !!agent.mcpConfig.project;

    let scope: "global" | "project";
    const ac = new AbortController();
    let escPressed = false;

    const escHandler = (data: Buffer) => {
      if (data.length === 1 && data[0] === 0x1b) {
        escPressed = true;
        ac.abort();
      }
    };
    process.stdin.on("data", escHandler);

    try {
      scope = await select<"global" | "project">({
        message: "Where should Promptly be active? \x1b[90m(esc to go back)\x1b[0m",
        choices: [
          {
            name: "Global (all projects)",
            value: "global" as const,
            description: hasGlobalInstructions
              ? `MCP + instructions applied everywhere`
              : `MCP config applied globally, instructions per-project`,
          },
          {
            name: "This project only",
            value: "project" as const,
            description: hasProjectMcp
              ? "MCP + instructions scoped to this directory"
              : "MCP is global, instructions scoped to this directory",
          },
        ],
      }, { signal: ac.signal });
    } catch {
      process.stdin.off("data", escHandler);
      if (escPressed) continue; // Esc — go back to step 1
      // Ctrl+C — exit gracefully
      console.log("\n  \x1b[90m✦ Setup cancelled.\x1b[0m\n");
      return;
    }
    process.stdin.off("data", escHandler);

    console.log("");

    // Step 3: Write MCP config
    if (scope === "project" && agent.mcpConfig.project) {
      const projectMcpPath = join(process.cwd(), agent.mcpConfig.project);
      await writeMcpConfig(projectMcpPath);
    } else {
      await writeMcpConfig(agent.mcpConfig.global);
    }

    // Step 4: Write instruction file
    if (scope === "global" && agent.instructions.global) {
      await writeInstructionFile(agent.instructions.global);
    } else {
      const projectInstructionPath = join(process.cwd(), agent.instructions.project);
      await writeInstructionFile(projectInstructionPath);

      if (scope === "global" && !agent.instructions.global) {
        console.log(`  \x1b[33mℹ\x1b[0m ${agent.label} instructions are per-project. Add ${agent.instructions.project} to each project.`);
      }
    }

    console.log("");
    console.log(`  ✦ Done! ${agent.restartMsg}`);
    console.log("");
    break;
  }
}
