import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { refinePrompt, getRulesDescription, type Agent } from "@promptly/rules";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "Promptly",
    version: "1.0.0",
  });

  // Hosted version: refine_prompt works with context passed in (no local fs access)
  server.tool(
    "refine_prompt",
    `Refines a coding prompt using Promptly's rules and optional codebase context.

    WHEN TO CALL: Any prompt asking to write, fix, refactor, or explain code. Any prompt involving files, components, functions, APIs, or databases.
    DO NOT CALL: For general questions, math, writing, or casual chat.

    Pass any known codebase context (stack, conventions, structure) as codebase_context for best results.
    Returns the refined prompt that you should execute instead of the original.`,
    {
      raw_prompt: z.string().describe("The original unmodified prompt from the user"),
      codebase_context: z.string().optional().describe("JSON string with codebase context (stack, conventions, etc.)"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent is being used"),
    },
    async ({ raw_prompt, codebase_context, agent }) => {
      let context = {};
      if (codebase_context) {
        try { context = JSON.parse(codebase_context); } catch { /* empty */ }
      }

      const { refined, rulesApplied } = refinePrompt(raw_prompt, context, agent as Agent);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            refined_prompt: refined,
            rules_applied: rulesApplied,
            original_prompt: raw_prompt,
          }, null, 2),
        }],
      };
    },
  );

  // get_refinement_rules
  server.tool(
    "get_refinement_rules",
    `Returns the current Promptly refinement rules. Call this if the user asks how Promptly works.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent to get rules for"),
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

  return server;
}
