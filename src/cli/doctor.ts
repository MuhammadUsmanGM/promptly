import { readFile, access } from "node:fs/promises";
import { join, isAbsolute, delimiter } from "node:path";
import { homedir } from "node:os";

const home = homedir();

// doctor vs status: status is a soft "what's wired"; doctor actually validates
// that each wire is electrified — JSON parses, the command resolves, the
// instruction file has the magic token (`refine_prompt`) that actually triggers
// the refinement flow at call time.
//
// We check all candidate locations per agent (global + project) because a user
// may have configured one or the other and either is legitimate.

interface InstructionPath {
  path: string;
  label: string;
}

interface AgentCheck {
  label: string;
  mcpPaths: string[];
  instructionPaths: InstructionPath[];
}

const AGENT_CHECKS: AgentCheck[] = [
  {
    label: "Claude Code",
    mcpPaths: [join(home, ".claude", "settings.json")],
    instructionPaths: [
      { path: join(home, ".claude", "CLAUDE.md"), label: "global CLAUDE.md" },
      { path: join(process.cwd(), "CLAUDE.md"), label: "project CLAUDE.md" },
    ],
  },
  {
    label: "Cursor",
    mcpPaths: [
      join(home, ".cursor", "mcp.json"),
      join(process.cwd(), ".cursor", "mcp.json"),
    ],
    instructionPaths: [
      { path: join(process.cwd(), ".cursorrules"), label: ".cursorrules" },
    ],
  },
  {
    label: "Gemini CLI",
    mcpPaths: [
      join(home, ".gemini", "settings.json"),
      join(process.cwd(), ".gemini", "settings.json"),
    ],
    instructionPaths: [
      { path: join(home, ".gemini", "GEMINI.md"), label: "global GEMINI.md" },
      { path: join(process.cwd(), "GEMINI.md"), label: "project GEMINI.md" },
    ],
  },
  {
    label: "Qwen Code",
    mcpPaths: [
      join(home, ".qwen", "settings.json"),
      join(process.cwd(), ".qwen", "settings.json"),
    ],
    instructionPaths: [
      { path: join(home, ".qwen", "QWEN.md"), label: "global QWEN.md" },
      { path: join(process.cwd(), "QWEN.md"), label: "project QWEN.md" },
    ],
  },
];

// --- ANSI helpers ---
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

type Severity = "ok" | "warn" | "err";

interface Finding {
  severity: Severity;
  message: string;
  detail?: string;
}

// --- Command resolvability check -----------------------------------------------
// PATH lookup without spawning a process. `which` works but shells out; we want
// doctor to be fast and silent. Use the standard algorithm: split PATH, try each
// dir + executable name. On Windows we'd need PATHEXT; keeping this POSIX-first
// since that's what the published binary targets.

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolvable(command: string): Promise<{ ok: boolean; reason?: string }> {
  // Absolute or relative path — check it exists as-is
  if (isAbsolute(command) || command.startsWith("./") || command.startsWith("../")) {
    return (await exists(command))
      ? { ok: true }
      : { ok: false, reason: `file not found: ${command}` };
  }

  // Bare command — walk PATH
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (await exists(join(dir, command))) return { ok: true };
    // Windows common extensions — cheap extra check
    if (process.platform === "win32") {
      for (const ext of [".cmd", ".exe", ".bat"]) {
        if (await exists(join(dir, command + ext))) return { ok: true };
      }
    }
  }
  return { ok: false, reason: `"${command}" not found on PATH` };
}

// --- Instruction file content validation --------------------------------------
// We check for `refine_prompt` specifically — that's the MCP tool name the
// instruction file must invoke. Older / hand-modified instruction files that
// just mention "Promptly" in prose won't actually trigger the flow. This is
// the most common failure mode when users update their instructions by hand.

const REQUIRED_INSTRUCTION_TOKEN = "refine_prompt";
const LEGACY_TOKEN = "Promptly";

interface InstructionCheck {
  found: boolean;
  hasRequiredToken: boolean;
  hasLegacyOnly: boolean;
  path?: string;
  label?: string;
}

async function checkInstructions(paths: InstructionPath[]): Promise<InstructionCheck> {
  for (const { path, label } of paths) {
    try {
      const content = await readFile(path, "utf-8");
      const hasRequired = content.includes(REQUIRED_INSTRUCTION_TOKEN);
      const hasLegacy = content.includes(LEGACY_TOKEN);
      if (hasRequired || hasLegacy) {
        return {
          found: true,
          hasRequiredToken: hasRequired,
          hasLegacyOnly: !hasRequired && hasLegacy,
          path,
          label,
        };
      }
    } catch {
      // File doesn't exist — continue to next candidate
    }
  }
  return { found: false, hasRequiredToken: false, hasLegacyOnly: false };
}

// --- MCP config validation ----------------------------------------------------

interface McpCheck {
  path: string;
  parseOk: boolean;
  entryFound: boolean;
  command?: string;
  args?: string[];
  parseError?: string;
}

async function readMcpConfig(path: string): Promise<McpCheck | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null; // file doesn't exist — caller treats as "not configured here"
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      path,
      parseOk: false,
      entryFound: false,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
  const settings = parsed as { mcpServers?: Record<string, { command?: string; args?: string[] }> };
  const entry = settings?.mcpServers?.["promptly"];
  if (!entry) {
    return { path, parseOk: true, entryFound: false };
  }
  return {
    path,
    parseOk: true,
    entryFound: true,
    command: entry.command,
    args: Array.isArray(entry.args) ? entry.args : [],
  };
}

// --- Per-agent diagnosis ------------------------------------------------------

interface AgentReport {
  label: string;
  findings: Finding[];
  configured: boolean;
}

async function diagnoseAgent(agent: AgentCheck): Promise<AgentReport> {
  const findings: Finding[] = [];

  // MCP — try each candidate path. If none exist, the agent is unconfigured.
  let mcpCheck: McpCheck | null = null;
  for (const p of agent.mcpPaths) {
    const result = await readMcpConfig(p);
    if (result) {
      mcpCheck = result;
      break;
    }
  }

  // Instruction file — same "first hit wins" logic as status, so we stay
  // consistent with what status reports.
  const instr = await checkInstructions(agent.instructionPaths);

  const configured = (mcpCheck !== null && mcpCheck.entryFound) || instr.found;
  if (!configured) {
    return { label: agent.label, findings, configured: false };
  }

  // --- MCP findings ---
  if (!mcpCheck) {
    findings.push({
      severity: "err",
      message: "MCP config missing",
      detail: `expected one of: ${agent.mcpPaths.join(", ")}`,
    });
  } else if (!mcpCheck.parseOk) {
    findings.push({
      severity: "err",
      message: `MCP config is not valid JSON`,
      detail: `${mcpCheck.path}: ${mcpCheck.parseError}`,
    });
  } else if (!mcpCheck.entryFound) {
    findings.push({
      severity: "err",
      message: `mcpServers.promptly entry missing`,
      detail: `in ${mcpCheck.path} — run \`promptly init\` to add it`,
    });
  } else {
    const cmd = mcpCheck.command;
    const args = mcpCheck.args ?? [];
    if (!cmd) {
      findings.push({
        severity: "err",
        message: `mcpServers.promptly.command is empty`,
        detail: mcpCheck.path,
      });
    } else {
      const resolved = await resolvable(cmd);
      if (!resolved.ok) {
        findings.push({
          severity: "err",
          message: `MCP command not runnable`,
          detail: resolved.reason,
        });
      } else {
        findings.push({
          severity: "ok",
          message: `MCP wired — ${cmd} ${args.join(" ")}`.trim(),
          detail: mcpCheck.path,
        });
      }
    }
  }

  // --- Instruction findings ---
  if (!instr.found) {
    findings.push({
      severity: "err",
      message: "Instruction file missing or empty of Promptly content",
      detail: `checked: ${agent.instructionPaths.map((p) => p.label).join(", ")}`,
    });
  } else if (!instr.hasRequiredToken && instr.hasLegacyOnly) {
    // Mentions "Promptly" but not "refine_prompt" — almost certainly a stale
    // or hand-edited instruction file that won't trigger the flow.
    findings.push({
      severity: "warn",
      message: "Instructions mention Promptly but not refine_prompt",
      detail: `${instr.label} — agent won't know which MCP tool to call. Re-run \`promptly init\` to refresh.`,
    });
  } else {
    findings.push({
      severity: "ok",
      message: `Instructions in ${instr.label}`,
      detail: instr.path,
    });
  }

  return { label: agent.label, findings, configured: true };
}

// --- CLI ----------------------------------------------------------------------

export interface DoctorOptions {
  json: boolean;
  strict: boolean;  // exit 1 on warnings too, not just errors
}

export function parseDoctorFlags(args: string[]): DoctorOptions {
  const opts: DoctorOptions = { json: false, strict: false };
  for (const arg of args) {
    if (arg === "--json") opts.json = true;
    else if (arg === "--strict") opts.strict = true;
    else {
      console.error(`Error: unknown flag "${arg}"`);
      process.exit(1);
    }
  }
  return opts;
}

export async function doctor(opts: DoctorOptions = { json: false, strict: false }): Promise<void> {
  const reports = await Promise.all(AGENT_CHECKS.map(diagnoseAgent));
  const configured = reports.filter((r) => r.configured);

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      configured: configured.map((r) => ({
        agent: r.label,
        findings: r.findings,
      })),
    }, null, 2) + "\n");
  } else {
    printHuman(reports);
  }

  // Exit code:
  //   0 — nothing wrong (ok + no configured agents → 0 with message)
  //   1 — at least one error, or --strict and at least one warning
  const anyErr = configured.some((r) => r.findings.some((f) => f.severity === "err"));
  const anyWarn = configured.some((r) => r.findings.some((f) => f.severity === "warn"));
  if (anyErr || (opts.strict && anyWarn)) process.exit(1);
}

function printHuman(reports: AgentReport[]): void {
  console.log("");

  const configured = reports.filter((r) => r.configured);

  if (configured.length === 0) {
    console.log(`  ${dim("No agents configured. Run:")} ${bold("promptly init")}`);
    console.log("");
    return;
  }

  let totalErr = 0;
  let totalWarn = 0;

  for (const report of configured) {
    console.log(`  ${bold(report.label)}`);
    for (const f of report.findings) {
      const icon = f.severity === "ok" ? green("✔")
        : f.severity === "warn" ? yellow("!")
        : red("✖");
      console.log(`  ${icon} ${f.message}`);
      if (f.detail) console.log(`      ${dim(f.detail)}`);
      if (f.severity === "err") totalErr++;
      if (f.severity === "warn") totalWarn++;
    }
    console.log("");
  }

  // Summary line
  if (totalErr === 0 && totalWarn === 0) {
    console.log(`  ${green("✔")} All checks passed.`);
  } else {
    const bits: string[] = [];
    if (totalErr > 0) bits.push(red(`${totalErr} error${totalErr === 1 ? "" : "s"}`));
    if (totalWarn > 0) bits.push(yellow(`${totalWarn} warning${totalWarn === 1 ? "" : "s"}`));
    console.log(`  ${bits.join(", ")}.`);
  }
  console.log("");
}
