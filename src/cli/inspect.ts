import { resolve } from "node:path";
import { analyzeCodebase } from "../analyzer/index.js";
import type { Agent, CodebaseContext } from "../rules/index.js";

const VALID_AGENTS: Agent[] = ["claude_code", "cursor", "gemini_cli", "qwen_code", "generic"];

export interface InspectOptions {
  path: string;          // absolute path to analyze
  agent: Agent;
  hints: string[];
  json: boolean;
}

// Small, forgiving flag parser. Mirrors the style in init.ts (no third-party
// argv libs). Exits on bad input rather than trying to recover silently —
// inspect is a debugging tool, silent weirdness defeats the point.
export function parseInspectFlags(args: string[]): InspectOptions {
  let path: string | undefined;
  let agent: Agent = "claude_code";
  const hints: string[] = [];
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--agent" || arg.startsWith("--agent=")) {
      const value = arg === "--agent" ? args[++i] : arg.slice("--agent=".length);
      if (!value) {
        console.error(`Error: --agent requires a value (${VALID_AGENTS.join("|")})`);
        process.exit(1);
      }
      if (!VALID_AGENTS.includes(value as Agent)) {
        console.error(`Error: invalid agent "${value}". Expected one of: ${VALID_AGENTS.join(", ")}`);
        process.exit(1);
      }
      agent = value as Agent;
      continue;
    }

    if (arg === "--hints" || arg.startsWith("--hints=")) {
      const value = arg === "--hints" ? args[++i] : arg.slice("--hints=".length);
      if (!value) {
        console.error("Error: --hints requires a comma-separated list of paths");
        process.exit(1);
      }
      for (const h of value.split(",").map((s) => s.trim()).filter(Boolean)) {
        hints.push(h);
      }
      continue;
    }

    if (arg.startsWith("--")) {
      console.error(`Error: unknown flag "${arg}"`);
      process.exit(1);
    }

    // First bare arg is the target path
    if (path === undefined) {
      path = arg;
      continue;
    }
    console.error(`Error: unexpected extra argument "${arg}"`);
    process.exit(1);
  }

  return {
    path: path ? resolve(path) : process.cwd(),
    agent,
    hints,
    json,
  };
}

export async function inspect(opts: InspectOptions): Promise<void> {
  const ctx = await analyzeCodebase(opts.path, {
    depth: 3,
    hints: opts.hints,
    agent: opts.agent,
  });

  if (opts.json) {
    // Raw — pipeable into jq. Don't bother coloring or re-ordering keys.
    process.stdout.write(JSON.stringify(ctx, null, 2) + "\n");
    return;
  }

  printHuman(ctx, opts);
}

// ANSI helpers — kept local rather than pulling in chalk. Banner.ts already
// does the same thing.
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function confColor(conf: number): (s: string) => string {
  if (conf >= 0.8) return green;
  if (conf >= 0.5) return yellow;
  return red;
}

function printHuman(ctx: CodebaseContext, opts: InspectOptions): void {
  console.log("");
  console.log(`  ${bold("Promptly inspect")}  ${dim(opts.path)}`);
  console.log("");

  // Workspace
  if (ctx.workspace) {
    const w = ctx.workspace;
    const scope = w.isSubPackage
      ? `scoped to ${w.analysisRootLabel}`
      : `root (pass --hints to narrow)`;
    console.log(`  ${bold("Workspace")}   ${w.tool} monorepo, ${w.packageCount} packages, ${scope}`);
    console.log("");
  }

  // Stack
  if (ctx.stack) {
    const s = ctx.stack;
    const line = [
      s.framework ?? "—",
      s.language,
      s.styling ? `styled with ${s.styling}` : null,
      s.orm ? `${s.orm} ORM` : null,
      s.testRunner ? `tests via ${s.testRunner}` : null,
      s.runtime ? `runtime ${s.runtime}` : null,
      `pkg ${s.packageManager}`,
    ].filter(Boolean).join(" / ");
    console.log(`  ${bold("Stack")}       ${line}`);
  } else {
    console.log(`  ${bold("Stack")}       ${dim("(not detected)")}`);
  }

  // Conventions — confidence is the single most-asked-about thing when a
  // refinement looks off, so make it visible.
  if (ctx.conventions) {
    const c = ctx.conventions;
    const cf = c.confidence;
    console.log(`  ${bold("Conventions")}`);
    const rows: [string, string, number][] = [
      ["naming", c.namingConvention, cf.naming],
      ["files", c.fileNaming, cf.fileNaming],
      ["exports", c.exportStyle, cf.exports],
      ["components", c.componentPattern ?? "—", cf.components],
      ["quotes", c.quotes, cf.quotes],
      ["semis", c.semicolons ? "yes" : "no", cf.semicolons],
    ];
    for (const [key, value, conf] of rows) {
      const color = confColor(conf);
      const confStr = color(conf.toFixed(2));
      console.log(`                ${key.padEnd(12)} ${value.padEnd(14)} ${dim("conf")} ${confStr}`);
    }
    const indent = `${c.indentation}${c.indentSize ? ` (size ${c.indentSize})` : ""}`;
    console.log(`                ${"indent".padEnd(12)} ${indent}`);
    console.log(`                ${"tests".padEnd(12)} ${c.testLocation}`);
  } else {
    console.log(`  ${bold("Conventions")} ${dim("(not detected)")}`);
  }

  // Structure — no tree dump (that can be huge). Summarize counts + keyDirs.
  if (ctx.structure) {
    const st = ctx.structure;
    const truncMarker = st.truncated ? yellow(" (truncated)") : "";
    console.log(`  ${bold("Structure")}   ${st.totalFiles} files, ${st.files.length} surfaced${truncMarker}`);
    if (st.rootDirs.length > 0) {
      console.log(`                root dirs: ${st.rootDirs.join(", ")}`);
    }
    const keyDirEntries = Object.entries(st.keyDirs);
    if (keyDirEntries.length > 0) {
      console.log(`                key dirs:`);
      for (const [dir, purpose] of keyDirEntries) {
        console.log(`                  ${dir.padEnd(24)} ${dim(purpose)}`);
      }
    }
  }

  // Dependencies — counts only. Full list goes to --json.
  if (ctx.dependencies) {
    const d = ctx.dependencies;
    console.log(`  ${bold("Dependencies")} ${d.production.length} prod, ${d.development.length} dev`);
    const catEntries = Object.entries(d.categories);
    if (catEntries.length > 0) {
      for (const [cat, pkgs] of catEntries) {
        console.log(`                ${cat.padEnd(16)} ${pkgs.slice(0, 6).join(", ")}${pkgs.length > 6 ? dim(` +${pkgs.length - 6} more`) : ""}`);
      }
    }
  }

  // User rules — source matters; showing content would drown the rest.
  if (ctx.userRules) {
    const r = ctx.userRules;
    const chars = r.content.length;
    const suffix = r.truncated ? yellow(" (truncated)") : "";
    console.log(`  ${bold("User rules")}  ${r.source} ${dim(`— ${chars} chars`)}${suffix}`);
  } else {
    console.log(`  ${bold("User rules")}  ${dim(`(none found for agent: ${opts.agent})`)}`);
  }

  console.log("");
  console.log(dim(`  Run with --json to get the full object for scripts.`));
  console.log("");
}
