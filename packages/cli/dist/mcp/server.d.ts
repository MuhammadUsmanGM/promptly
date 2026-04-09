import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

declare function createServer(): McpServer;
declare function startStdioServer(): Promise<void>;

export { createServer, startStdioServer };
