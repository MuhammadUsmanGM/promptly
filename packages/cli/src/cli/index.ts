import { init } from "./init.js";
import { status } from "./status.js";
import { getRulesDescription } from "@promptly/rules";

export async function runCli(args: string[]) {
  const command = args[0];

  switch (command) {
    case "init":
      await init();
      break;

    case "mcp": {
      // Start the MCP server — imported dynamically to avoid loading
      // heavy deps when just running CLI commands
      const { startStdioServer } = await import("../mcp/server.js");
      await startStdioServer();
      break;
    }

    case "status":
      await status();
      break;

    case "rules": {
      const agent = args[1] ?? "claude_code";
      const rules = getRulesDescription(agent as "claude_code" | "cursor" | "gemini_cli" | "generic");
      console.log("");
      console.log("  ✦ Promptly Refinement Rules");
      console.log(`    Agent: ${agent}`);
      console.log("");
      console.log(rules);
      console.log("");
      break;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined:
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
  ✦ Promptly — Better prompts, better code

  Usage:
    promptly init          Set up Promptly for Claude Code
    promptly mcp           Start MCP server (used by Claude Code)
    promptly status        Check if Promptly is configured
    promptly rules [agent] Print refinement rules (claude_code|cursor|gemini_cli|generic)
    promptly --version     Print version
    promptly --help        Print this help
`);
}
