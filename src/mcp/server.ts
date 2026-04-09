import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { VERSION } from "../cli/banner.js";

export function createServer(debug = false): McpServer {
  const server = new McpServer({
    name: "Promptly",
    version: VERSION,
  });

  registerTools(server, debug);
  return server;
}

export async function startStdioServer(debug = false) {
  const server = createServer(debug);
  const transport = new StdioServerTransport();
  if (debug) {
    console.error(`[promptly] v${VERSION} starting in debug mode`);
    console.error(`[promptly] pid=${process.pid}, node=${process.version}`);
  }
  console.error("Promptly MCP server running on stdio — waiting for client connection...");
  await server.connect(transport);
  if (debug) {
    console.error("[promptly] client connected");
  }
}
