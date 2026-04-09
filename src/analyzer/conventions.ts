import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type { ConventionInfo } from "../rules/index.js";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte",
  ".py", ".go", ".rs", ".java", ".rb",
]);

async function sampleFiles(projectPath: string, max = 15): Promise<string[]> {
  const files: string[] = [];
  const srcDir = join(projectPath, "src");

  async function walk(dir: string, depth = 0) {
    if (depth > 4 || files.length >= max) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= max) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;

        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Prefer src/ if it exists
  try {
    await stat(srcDir);
    await walk(srcDir);
  } catch {
    await walk(projectPath);
  }

  return files;
}

function detectNamingConvention(names: string[]): ConventionInfo["namingConvention"] {
  let camel = 0, snake = 0, pascal = 0;
  for (const name of names) {
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) camel++;
    else if (/^[a-z][a-z0-9_]*$/.test(name)) snake++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) pascal++;
  }
  const total = camel + snake + pascal;
  if (total === 0) return "mixed";
  if (camel / total > 0.6) return "camelCase";
  if (snake / total > 0.6) return "snake_case";
  if (pascal / total > 0.6) return "PascalCase";
  return "mixed";
}

function detectFileNaming(fileNames: string[]): ConventionInfo["fileNaming"] {
  let kebab = 0, camel = 0, pascal = 0, snake = 0;
  for (const name of fileNames) {
    const base = name.replace(/\.[^.]+$/, ""); // strip extension
    if (/^[a-z][a-z0-9-]*$/.test(base)) kebab++;
    else if (/^[a-z][a-zA-Z0-9]*$/.test(base)) camel++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(base)) pascal++;
    else if (/^[a-z][a-z0-9_]*$/.test(base)) snake++;
  }
  const total = kebab + camel + pascal + snake;
  if (total === 0) return "mixed";
  if (kebab / total > 0.5) return "kebab-case";
  if (camel / total > 0.5) return "camelCase";
  if (pascal / total > 0.5) return "PascalCase";
  if (snake / total > 0.5) return "snake_case";
  return "mixed";
}

export async function detectConventions(projectPath: string): Promise<ConventionInfo | null> {
  const files = await sampleFiles(projectPath);
  if (files.length === 0) return null;

  const fileNames = files.map((f) => basename(f));
  const variableNames: string[] = [];
  let funcCount = 0, classCount = 0;
  let namedExports = 0, defaultExports = 0;
  let semiCount = 0, noSemiCount = 0;
  let singleQuotes = 0, doubleQuotes = 0;
  let tabLines = 0, spaceLines = 0;
  let indentSizes: number[] = [];
  let hasTests = false;
  let testLocation: ConventionInfo["testLocation"] = "colocated";

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").slice(0, 100); // first 100 lines

      for (const line of lines) {
        // Indentation
        if (line.startsWith("\t")) tabLines++;
        else if (line.startsWith("  ")) {
          spaceLines++;
          const match = line.match(/^( +)/);
          if (match) indentSizes.push(match[1].length);
        }

        // Semicolons (non-empty lines ending with ;)
        const trimmed = line.trim();
        if (trimmed.length > 5) {
          if (trimmed.endsWith(";")) semiCount++;
          else if (/[a-zA-Z0-9'"`)\]]$/.test(trimmed)) noSemiCount++;
        }

        // Quotes
        const singleMatch = line.match(/'/g);
        const doubleMatch = line.match(/"/g);
        if (singleMatch) singleQuotes += singleMatch.length;
        if (doubleMatch) doubleQuotes += doubleMatch.length;

        // Variable names (const/let/var xxx)
        const varMatch = trimmed.match(/^(?:const|let|var|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (varMatch) variableNames.push(varMatch[1]);

        // Exports
        if (trimmed.startsWith("export default")) defaultExports++;
        else if (trimmed.startsWith("export ")) namedExports++;

        // Components
        if (/^(?:export\s+)?(?:default\s+)?function\s+[A-Z]/.test(trimmed)) funcCount++;
        if (/^(?:export\s+)?class\s+[A-Z]/.test(trimmed)) classCount++;
      }

      // Test detection
      if (filePath.includes("__tests__")) { hasTests = true; testLocation = "__tests__"; }
      else if (filePath.includes(".test.") || filePath.includes(".spec.")) { hasTests = true; }
    } catch { /* skip unreadable files */ }
  }

  // Check for test/ or tests/ directory
  try {
    await stat(join(projectPath, "test"));
    testLocation = "test_dir";
  } catch {
    try {
      await stat(join(projectPath, "tests"));
      testLocation = "test_dir";
    } catch { /* no test dir */ }
  }

  const componentPattern = classCount > funcCount ? "class" as const
    : funcCount > 0 ? "functional" as const
    : undefined;

  const exportStyle = defaultExports > namedExports * 2 ? "default" as const
    : namedExports > defaultExports * 2 ? "named" as const
    : "mixed" as const;

  // Determine most common indent size
  let indentSize: number | undefined;
  if (indentSizes.length > 0) {
    const counts = new Map<number, number>();
    for (const s of indentSizes) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    // Find smallest common indent (likely the base)
    const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    indentSize = sorted[0]?.[0] ?? 2;
    if (indentSize > 4) indentSize = 2; // fallback
  }

  return {
    namingConvention: detectNamingConvention(variableNames),
    fileNaming: detectFileNaming(fileNames),
    componentPattern,
    exportStyle,
    testLocation: hasTests ? testLocation : "colocated",
    indentation: tabLines > spaceLines ? "tabs" : "spaces",
    indentSize,
    semicolons: semiCount > noSemiCount,
    quotes: singleQuotes > doubleQuotes ? "single" : "double",
  };
}
