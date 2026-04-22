import { init, parseInitFlags } from "./init.js";
import { status, parseStatusFlags } from "./status.js";
import { inspect, parseInspectFlags } from "./inspect.js";
import { doctor, parseDoctorFlags } from "./doctor.js";
import { printBanner, VERSION } from "./banner.js";
import { getRulesDescription } from "../rules/index.js";

export async function runCli(args: string[]) {
  const command = args[0];

  switch (command) {
    case "init": {
      const initOpts = parseInitFlags(args.slice(1));
      printBanner();
      await init(initOpts);
      break;
    }

    case "mcp": {
      const debug = args.includes("--debug");
      const { startStdioServer } = await import("../mcp/server.js");
      await startStdioServer(debug);
      break;
    }

    case "status": {
      const statusOpts = parseStatusFlags(args.slice(1));
      if (!statusOpts.json) printBanner();
      await status(statusOpts);
      break;
    }

    case "inspect": {
      // Don't print the banner for JSON output — it would break jq piping.
      const inspectOpts = parseInspectFlags(args.slice(1));
      await inspect(inspectOpts);
      break;
    }

    case "doctor": {
      const doctorOpts = parseDoctorFlags(args.slice(1));
      if (!doctorOpts.json) printBanner();
      await doctor(doctorOpts);
      break;
    }

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

    promptly init                      Set up Promptly (interactive wizard)
    promptly init --global             Skip scope prompt — configure globally
    promptly init --project            Skip scope prompt — configure this project only
    promptly init --agent <id>         Skip agent prompt (claude_code|cursor|gemini_cli|qwen_code)
    promptly init --agent <id> --global   Fully non-interactive — ideal for scripts/CI
    promptly mcp                       Start MCP server (called automatically by your agent)
    promptly mcp --debug               Start MCP server with diagnostic logging
    promptly status                    Check which agents are configured
    promptly status --json             Emit agent wiring state as JSON (for scripting)
    promptly doctor                    Validate wiring (MCP config parses, command resolves, instructions present)
    promptly doctor --strict           Exit 1 on warnings too (for CI gating)
    promptly doctor --json             Emit raw JSON
    promptly inspect [path]            Print what analyzeCodebase sees for the cwd (or path)
    promptly inspect --json            Emit raw JSON (pipe to jq for scripts)
    promptly inspect --agent <id>      Inspect as a specific agent (affects user-rules lookup)
    promptly inspect --hints <paths>   Comma-separated paths for monorepo routing
    promptly rules [agent]             Print refinement rules
    promptly --version                 Print version
    promptly --help                    Print this help
`);
}
