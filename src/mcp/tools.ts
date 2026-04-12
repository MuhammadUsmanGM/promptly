import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { analyzeCodebase } from "../analyzer/index.js";
import { refinePrompt, getRulesDescription, type Agent, type CodebaseContext } from "../rules/index.js";

// Cache analysis per project path — invalidated by file watchers or 30min TTL
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (conventions rarely change)
const WATCHED_FILES = ["package.json", "tsconfig.json"];

interface CacheEntry {
  context: CodebaseContext;
  timestamp: number;
  watchers: FSWatcher[];
}

const analysisCache = new Map<string, CacheEntry>();

function invalidateCache(projectPath: string) {
  const entry = analysisCache.get(projectPath);
  if (entry) {
    for (const w of entry.watchers) w.close();
    analysisCache.delete(projectPath);
  }
}

function watchProjectFiles(projectPath: string): FSWatcher[] {
  const watchers: FSWatcher[] = [];
  for (const file of WATCHED_FILES) {
    try {
      const w = watch(join(projectPath, file), () => {
        invalidateCache(projectPath);
      });
      w.on("error", () => {}); // file may not exist — ignore
      watchers.push(w);
    } catch {
      // file doesn't exist — skip
    }
  }
  return watchers;
}

function getCachedAnalysis(projectPath: string): CodebaseContext | null {
  const entry = analysisCache.get(projectPath);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    invalidateCache(projectPath);
    return null;
  }
  return entry.context;
}

function setCachedAnalysis(projectPath: string, context: CodebaseContext) {
  invalidateCache(projectPath); // clean up any old watchers
  const watchers = watchProjectFiles(projectPath);
  analysisCache.set(projectPath, { context, timestamp: Date.now(), watchers });
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
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "qwen_code", "generic"]).optional().default("claude_code"),
    },
    async ({ raw_prompt, project_path, agent }) => {
      log(`refine_prompt called — path=${project_path}, agent=${agent}`);
      try {
        let context = getCachedAnalysis(project_path);
        if (!context) {
          log("cache miss — analyzing codebase");
          context = await analyzeCodebase(project_path, 3);
          setCachedAnalysis(project_path, context);
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
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "qwen_code", "generic"]).optional().default("generic"),
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
