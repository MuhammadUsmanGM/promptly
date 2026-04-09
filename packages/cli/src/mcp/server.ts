import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Promptly",
    version: "1.0.0",
  });

  registerTools(server);
  return server;
}

export async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
