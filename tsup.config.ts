import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/bin/promptly.ts",
    "src/mcp/server.ts",
    "src/cli/index.ts",
  ],
  format: ["esm"],
  dts: true,
  splitting: true,
});
