import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/bin/promptly.js", "mcp", "--debug"],
});
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

const home = process.env.HOME;

// Test 1: Rich project
console.log("=== RICH PROJECT (expect conventions injected) ===");
const rich = await client.callTool({
  name: "refine_prompt",
  arguments: { raw_prompt: "add a checkout page", project_path: `${home}/tmp/rich-proj`, agent: "claude_code" },
});
console.log(rich.content[0].text.split("\n---")[0]);

// Also show the raw analysis to see confidence scores
const richAnalysis = await client.callTool({
  name: "refine_prompt",
  arguments: { raw_prompt: "add a button", project_path: `${home}/tmp/rich-proj`, agent: "claude_code" },
});

// Test 2: Tiny project
console.log("\n=== TINY PROJECT (expect fewer/no conventions) ===");
const tiny = await client.callTool({
  name: "refine_prompt",
  arguments: { raw_prompt: "add a login form", project_path: `${home}/tmp/tiny-proj`, agent: "claude_code" },
});
console.log(tiny.content[0].text.split("\n---")[0]);

await client.close();
