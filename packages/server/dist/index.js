// src/index.ts
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// src/mcp-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { refinePrompt, getRulesDescription } from "@promptly/rules";
function createMcpServer() {
  const server = new McpServer({
    name: "Promptly",
    version: "1.0.0"
  });
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
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent is being used")
    },
    async ({ raw_prompt, codebase_context, agent }) => {
      let context = {};
      if (codebase_context) {
        try {
          context = JSON.parse(codebase_context);
        } catch {
        }
      }
      const { refined, rulesApplied } = refinePrompt(raw_prompt, context, agent);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            refined_prompt: refined,
            rules_applied: rulesApplied,
            original_prompt: raw_prompt
          }, null, 2)
        }]
      };
    }
  );
  server.tool(
    "get_refinement_rules",
    `Returns the current Promptly refinement rules. Call this if the user asks how Promptly works.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent to get rules for")
    },
    async ({ agent }) => {
      return {
        content: [{
          type: "text",
          text: getRulesDescription(agent)
        }]
      };
    }
  );
  return server;
}

// src/index.ts
var app = express();
var PORT = parseInt(process.env["PORT"] ?? "3000", 10);
var transports = /* @__PURE__ */ new Map();
app.get("/", (_req, res) => {
  res.json({
    name: "Promptly",
    status: "ok",
    version: "1.0.0",
    description: "Automatically refines your coding prompts. Better prompts, better code."
  });
});
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  const server = createMcpServer();
  res.on("close", () => {
    transports.delete(sessionId);
  });
  await server.connect(transport);
});
app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query["sessionId"];
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "No active session found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});
app.listen(PORT, () => {
  console.log(`  \u2726 Promptly server running on port ${PORT}`);
  console.log(`  \u2726 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  \u2726 Health check: http://localhost:${PORT}/`);
});
