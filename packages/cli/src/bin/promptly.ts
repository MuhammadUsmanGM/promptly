#!/usr/bin/env node
import { runCli } from "../cli/index.js";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`\n  \x1b[31m✖ ${error instanceof Error ? error.message : String(error)}\x1b[0m\n`);
  process.exit(1);
});
