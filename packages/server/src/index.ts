import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./mcp-server.js";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

// Track active transports for message routing
const transports = new Map<string, SSEServerTransport>();

// Health check
app.get("/", (_req, res) => {
  res.json({
    name: "Promptly",
    status: "ok",
    version: "1.0.0",
    description: "Automatically refines your coding prompts. Better prompts, better code.",
  });
});

// SSE endpoint — Claude.ai connects here
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

// Message handler
app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query["sessionId"] as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(400).json({ error: "No active session found" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`  ✦ Promptly server running on port ${PORT}`);
  console.log(`  ✦ SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  ✦ Health check: http://localhost:${PORT}/`);
});
