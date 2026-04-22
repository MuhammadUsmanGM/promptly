import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/bin/promptly.ts",
    "src/mcp/server.ts",
    "src/mcp/persistentCache.ts",
    "src/analyzer/stack.ts",
    "src/cli/index.ts",
    "src/postinstall.ts",
  ],
  format: ["esm"],
  dts: true,
  splitting: true,
});
