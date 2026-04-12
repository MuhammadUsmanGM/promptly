import { init } from "./init.js";
import { status } from "./status.js";
import { printBanner, VERSION } from "./banner.js";
import { getRulesDescription } from "../rules/index.js";

export async function runCli(args: string[]) {
  const command = args[0];

  switch (command) {
    case "init":
      printBanner();
      await init();
      break;

    case "mcp": {
      const debug = args.includes("--debug");
      const { startStdioServer } = await import("../mcp/server.js");
      await startStdioServer(debug);
      break;
    }

    case "status":
      printBanner();
      await status();
      break;

    case "rules": {
      printBanner();
      const agent = args[1] ?? "claude_code";
      const rules = getRulesDescription(agent as "claude_code" | "cursor" | "gemini_cli" | "generic");
      console.log(`  \x1b[1mRefinement Rules\x1b[0m \x1b[90m(${agent})\x1b[0m`);
      console.log("");
      console.log(rules);
      console.log("");
      break;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printBanner();
      printHelp();
      break;

    case "--version":
    case "-v":
      console.log(VERSION);
      break;

    default:
      printBanner();
      console.error(`  \x1b[31mUnknown command: ${command}\x1b[0m`);
      console.log("");
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`  \x1b[1mUsage:\x1b[0m

    promptly init          Set up Promptly (Claude Code, Cursor, or Gemini CLI)
    promptly mcp           Start MCP server (called automatically by your agent)
    promptly mcp --debug   Start MCP server with diagnostic logging
    promptly status        Check which agents are configured
    promptly rules [agent] Print refinement rules
    promptly --version     Print version
    promptly --help        Print this help
`);
}
