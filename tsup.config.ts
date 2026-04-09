import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/bin/promptly.ts",
    "src/mcp/server.ts",
    "src/cli/index.ts",
    "src/postinstall.ts",
  ],
  format: ["esm"],
  dts: true,
  splitting: true,
});
