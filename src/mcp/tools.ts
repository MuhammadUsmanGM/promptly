import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeCodebase } from "../analyzer/index.js";
import { refinePrompt, getRulesDescription, type Agent } from "../rules/index.js";
import { VERSION } from "../cli/banner.js";

export function registerTools(server: McpServer, debug = false) {
  const log = debug
    ? (...args: unknown[]) => console.error("[promptly]", ...args)
    : () => {};

  // Tool 1: analyze_codebase — the real value
  server.tool(
    "analyze_codebase",
    `Analyzes the project at the given path and returns structured context about the tech stack, code conventions, file structure, and dependencies. Call this before refining a prompt to understand what you're working with.`,
    {
      project_path: z.string().describe("Absolute path to the project root directory"),
      depth: z.number().optional().default(3).describe("How deep to scan the file tree (default 3)"),
    },
    async ({ project_path, depth }) => {
      log(`analyze_codebase called — path=${project_path}, depth=${depth}`);
      try {
        const context = await analyzeCodebase(project_path, depth);
        log(`analyze_codebase done — stack=${context.stack?.framework ?? "unknown"}, files=${context.structure?.totalFiles ?? 0}`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      } catch (error) {
        log(`analyze_codebase error —`, error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing codebase: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool 2: refine_prompt — applies rules + context
  server.tool(
    "refine_prompt",
    `Refines a coding prompt using Promptly's rules and optional codebase context.

    WHEN TO CALL: Any prompt asking to write, fix, refactor, or explain code. Any prompt involving files, components, functions, APIs, or databases.
    DO NOT CALL: For general questions, math, writing, or casual chat.

    For best results, call analyze_codebase first and pass the result as codebase_context.
    Returns the refined prompt that you should execute instead of the original.`,
    {
      raw_prompt: z.string().describe("The original unmodified prompt from the user"),
      codebase_context: z.string().optional().describe("JSON string from analyze_codebase output"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("claude_code").describe("Which agent is being used"),
    },
    async ({ raw_prompt, codebase_context, agent }) => {
      log(`refine_prompt called — agent=${agent}, prompt="${raw_prompt.slice(0, 80)}..."`);
      let context = {};
      if (codebase_context) {
        try {
          context = JSON.parse(codebase_context);
        } catch { /* use empty context */ }
      }

      const { refined, rulesApplied } = refinePrompt(raw_prompt, context, agent as Agent);
      log(`refine_prompt done — rules applied: ${rulesApplied.join(", ") || "none"}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              refined_prompt: refined,
              rules_applied: rulesApplied,
              original_prompt: raw_prompt,
              _promptly: {
                version: VERSION,
                note: "Start your response with: ✦ Refined by Promptly — then execute the refined_prompt above, not the original.",
              },
            }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 3: get_refinement_rules — reference/transparency
  server.tool(
    "get_refinement_rules",
    `Returns the current Promptly refinement rules for the specified agent. Call this if the user asks how Promptly works or if you need a refresher on the rules.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent to get rules for"),
    },
    async ({ agent }) => {
      log(`get_refinement_rules called — agent=${agent}`);
      const description = getRulesDescription(agent as Agent);
      return {
        content: [
          {
            type: "text" as const,
            text: description,
          },
        ],
      };
    },
  );
}
