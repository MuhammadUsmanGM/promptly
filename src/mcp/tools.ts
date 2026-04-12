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

export function registerTools(server: McpServer, debug = false) {
  const log = debug
    ? (...args: unknown[]) => console.error("[promptly]", ...args)
    : () => {};

  server.tool(
    "refine_prompt",
    `Analyzes the codebase and rewrites a coding prompt with project context baked in. Detects intent (create/fix/refactor/explain/configure) and tailors the rewrite accordingly.

WHEN TO CALL: Any prompt to write, fix, refactor, explain, or configure code.
SKIP FOR: General chat, math, non-coding questions.

Returns a rewritten prompt. Execute it instead of the original.`,
    {
      raw_prompt: z.string().describe("The user's original prompt"),
      project_path: z.string().describe("Absolute path to the project root"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("claude_code"),
    },
    async ({ raw_prompt, project_path, agent }) => {
      log(`refine_prompt called — path=${project_path}, agent=${agent}`);
      try {
        let context = getCachedAnalysis(project_path);
        if (!context) {
          log("cache miss — analyzing codebase");
          context = await analyzeCodebase(project_path, 3);
          analysisCache.set(project_path, { context, timestamp: Date.now() });
        } else {
          log("cache hit");
        }

        const { refined, intent } = refinePrompt(raw_prompt, context, agent as Agent);
        log(`done — intent=${intent}`);

        return {
          content: [{
            type: "text" as const,
            text: `${refined}\n\n---\n[Promptly] intent: ${intent}`,
          }],
        };
      } catch (error) {
        log("error —", error);
        return {
          content: [{
            type: "text" as const,
            text: raw_prompt,
          }],
        };
      }
    },
  );

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
