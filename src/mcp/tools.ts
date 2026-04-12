import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeCodebase } from "../analyzer/index.js";
import { refinePrompt, getRulesDescription, type Agent, type CodebaseContext } from "../rules/index.js";

// Cache analysis per project path to avoid re-scanning every prompt
const analysisCache = new Map<string, { context: CodebaseContext; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedAnalysis(projectPath: string): CodebaseContext | null {
  const cached = analysisCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.context;
  return null;
}

function formatCompact(context: CodebaseContext): string {
  const parts: string[] = [];

  if (context.stack) {
    const s = context.stack;
    const stack = [s.framework, s.language, s.styling, s.orm, s.testRunner]
      .filter(Boolean).join(", ");
    parts.push(`Stack: ${stack} | pkg: ${s.packageManager}${s.runtime ? ` | ${s.runtime}` : ""}`);
  }

  if (context.conventions) {
    const c = context.conventions;
    parts.push(`Style: ${c.namingConvention} vars, ${c.fileNaming} files, ${c.quotes} quotes, ${c.semicolons ? "semi" : "no-semi"}, ${c.exportStyle} exports${c.componentPattern ? `, ${c.componentPattern} components` : ""}, tests: ${c.testLocation}`);
  }

  if (context.structure?.keyDirs) {
    const dirs = Object.entries(context.structure.keyDirs)
      .map(([d, p]) => `${d}(${p})`)
      .join(", ");
    if (dirs) parts.push(`Dirs: ${dirs}`);
  }

  if (context.dependencies?.categories) {
    const cats = Object.entries(context.dependencies.categories)
      .map(([cat, pkgs]) => `${cat}: ${pkgs.join(", ")}`)
      .join(" | ");
    if (cats) parts.push(`Deps: ${cats}`);
  }

  return parts.join("\n");
}

export function registerTools(server: McpServer, debug = false) {
  const log = debug
    ? (...args: unknown[]) => console.error("[promptly]", ...args)
    : () => {};

  // Single tool: analyze + refine in one call
  server.tool(
    "refine_prompt",
    `Analyzes the codebase and refines a coding prompt in one step. Call this for any coding task — it scans the project's stack, conventions, structure, and dependencies, then rewrites the prompt with that context baked in.

WHEN TO CALL: Any prompt to write, fix, refactor, explain, or configure code.
SKIP FOR: General chat, math, non-coding questions.

Returns a refined prompt. Execute it instead of the original.`,
    {
      raw_prompt: z.string().describe("The user's original prompt"),
      project_path: z.string().describe("Absolute path to the project root"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("claude_code"),
    },
    async ({ raw_prompt, project_path, agent }) => {
      log(`refine_prompt called — path=${project_path}, agent=${agent}`);
      try {
        // Use cached analysis if fresh, otherwise scan
        let context = getCachedAnalysis(project_path);
        if (!context) {
          log("cache miss — analyzing codebase");
          context = await analyzeCodebase(project_path, 3);
          analysisCache.set(project_path, { context, timestamp: Date.now() });
        } else {
          log("cache hit");
        }

        const { refined, rulesApplied } = refinePrompt(raw_prompt, context, agent as Agent);
        const compactContext = formatCompact(context);
        log(`done — rules: ${rulesApplied.join(", ") || "none"}`);

        // Compact output: refined prompt + one-line context summary
        return {
          content: [{
            type: "text" as const,
            text: `${refined}\n\n---\n[Promptly] ${rulesApplied.length} rules applied. Context:\n${compactContext}`,
          }],
        };
      } catch (error) {
        log("error —", error);
        // On failure, return original prompt so Claude can still proceed
        return {
          content: [{
            type: "text" as const,
            text: raw_prompt,
          }],
        };
      }
    },
  );

  // Lightweight reference tool — only called if user asks about Promptly
  server.tool(
    "get_refinement_rules",
    `Returns Promptly's rules. Only call if the user asks how Promptly works.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic"),
    },
    async ({ agent }) => {
      return {
        content: [{
          type: "text" as const,
          text: getRulesDescription(agent as Agent),
        }],
      };
    },
  );
}
