import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, basename, relative } from "node:path";
import type { ConventionInfo, ConventionConfidence } from "../rules/index.js";
import { detectConfigConventions } from "./configConventions.js";
import { loadGitignore, type GitignoreMatcher } from "./gitignore.js";

// Minimum sample sizes for high confidence
const MIN_SAMPLES_FILES = 5;     // need enough files
const MIN_SAMPLES_EXPORTS = 5;   // need enough export statements
const MIN_SAMPLES_COMPONENTS = 3; // fewer components expected
const MIN_SAMPLES_STYLE = 10;    // semicolons/quotes need many lines

function computeConfidence(dominant: number, total: number, minSamples: number): number {
  if (total === 0) return 0;
  const ratio = dominant / total;       // how dominant is the winner
  const coverage = Math.min(total / minSamples, 1); // do we have enough samples
  return Math.round(ratio * coverage * 100) / 100;
}

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte",
  ".py", ".go", ".rs", ".java", ".rb",
]);

async function sampleFiles(projectPath: string, max = 15): Promise<string[]> {
  const files: string[] = [];
  const srcDir = join(projectPath, "src");

  // Respect .gitignore when sampling — generated files (dist/, *.generated.ts)
  // skew detected conventions away from what humans actually wrote. loadGitignore
  // returns a no-op matcher if .gitignore is missing or malformed, so this is
  // always safe to call.
  const ignore = await loadGitignore(projectPath);

  async function walk(dir: string, depth = 0, matcher: GitignoreMatcher) {
    if (depth > 4 || files.length >= max) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= max) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;

        const fullPath = join(dir, entry.name);
        const relPath = relative(projectPath, fullPath).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          if (matcher.isIgnoredDir(relPath)) continue;
          await walk(fullPath, depth + 1, matcher);
        } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
          if (matcher.isIgnored(relPath)) continue;
          files.push(fullPath);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Prefer src/ if it exists
  try {
    await stat(srcDir);
    await walk(srcDir, 0, ignore);
  } catch {
    await walk(projectPath, 0, ignore);
  }

  return files;
}

function detectFileNaming(fileNames: string[]): { value: ConventionInfo["fileNaming"]; dominant: number; total: number } {
  let kebab = 0, camel = 0, pascal = 0, snake = 0;
  for (const name of fileNames) {
    const base = name.replace(/\.[^.]+$/, ""); // strip extension
    if (/^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(base)) kebab++;
    else if (/^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(base)) camel++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(base)) pascal++;
    else if (/^[a-z][a-z0-9]*_[a-z0-9_]*$/.test(base)) snake++;
  }
  const total = kebab + camel + pascal + snake;
  if (total === 0) return { value: "mixed", dominant: 0, total: 0 };
  if (kebab / total > 0.5) return { value: "kebab-case", dominant: kebab, total };
  if (camel / total > 0.5) return { value: "camelCase", dominant: camel, total };
  if (pascal / total > 0.5) return { value: "PascalCase", dominant: pascal, total };
  if (snake / total > 0.5) return { value: "snake_case", dominant: snake, total };
  return { value: "mixed", dominant: Math.max(kebab, camel, pascal, snake), total };
}

export async function detectConventions(projectPath: string): Promise<ConventionInfo | null> {
  // Tool configs are ground truth — if .prettierrc says singleQuote: true,
  // the project uses single quotes, full stop. Read them first and let
  // sampling fill in what the configs don't cover (naming, exports, etc.).
  const configs = await detectConfigConventions(projectPath);

  const files = await sampleFiles(projectPath);
  if (files.length === 0) {
    // No source files to sample, but we may still have useful config info.
    // Return a minimal result driven entirely by configs (if any).
    if (configs.sources.length === 0) return null;
  }

  const fileNames = files.map((f) => basename(f));
  let funcCount = 0, classCount = 0;
  let namedExports = 0, defaultExports = 0;
  let semiCount = 0, noSemiCount = 0;
  let singleQuotes = 0, doubleQuotes = 0;
  let tabLines = 0, spaceLines = 0;
  const indentSizes: number[] = [];
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

        // Exports
        if (trimmed.startsWith("export default")) defaultExports++;
        else if (trimmed.startsWith("export ")) namedExports++;

        // Components
        if (/^(?:export\s+)?(?:default\s+)?function\s+[A-Z]/.test(trimmed)) funcCount++;
        if (/^(?:export\s+)?class\s+[A-Z]/.test(trimmed)) classCount++;
      }

      // Test detection — only set testLocation if not already detected from files
      if (filePath.includes("__tests__")) { hasTests = true; if (testLocation === "colocated") testLocation = "__tests__"; }
      else if (filePath.includes(".test.") || filePath.includes(".spec.")) { hasTests = true; }
    } catch { /* skip unreadable files */ }
  }

  // Check for test/ or tests/ directory — only if no file-level detection set it
  if (testLocation === "colocated") {
    try {
      await stat(join(projectPath, "test"));
      testLocation = "test_dir";
    } catch {
      try {
        await stat(join(projectPath, "tests"));
        testLocation = "test_dir";
      } catch { /* no test dir */ }
    }
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

  const fileNamingResult = detectFileNaming(fileNames);

  const totalExports = namedExports + defaultExports;
  const dominantExports = Math.max(namedExports, defaultExports);
  const totalComponents = funcCount + classCount;
  const dominantComponents = Math.max(funcCount, classCount);
  const totalSemicolons = semiCount + noSemiCount;
  const dominantSemicolons = Math.max(semiCount, noSemiCount);
  const totalQuotes = singleQuotes + doubleQuotes;
  const dominantQuotes = Math.max(singleQuotes, doubleQuotes);

  const confidence: ConventionConfidence = {
    fileNaming: computeConfidence(fileNamingResult.dominant, fileNamingResult.total, MIN_SAMPLES_FILES),
    exports: computeConfidence(dominantExports, totalExports, MIN_SAMPLES_EXPORTS),
    components: computeConfidence(dominantComponents, totalComponents, MIN_SAMPLES_COMPONENTS),
    semicolons: computeConfidence(dominantSemicolons, totalSemicolons, MIN_SAMPLES_STYLE),
    quotes: computeConfidence(dominantQuotes, totalQuotes, MIN_SAMPLES_STYLE),
  };

  // Ground-truth overrides: any convention set in a tool config wins over the
  // sampled value and gets full confidence. Sampling stays authoritative for
  // anything the configs don't cover (naming, exports, components, test loc).
  const sampledQuotes = singleQuotes > doubleQuotes ? "single" : "double";
  const sampledSemis = semiCount > noSemiCount;
  const sampledIndentation: "tabs" | "spaces" = tabLines > spaceLines ? "tabs" : "spaces";

  const quotes = configs.quotes ?? sampledQuotes;
  const semicolons = configs.semicolons ?? sampledSemis;
  const indentation = configs.indentation ?? sampledIndentation;
  const finalIndentSize = configs.indentSize ?? indentSize;

  if (configs.quotes) confidence.quotes = 1.0;
  if (configs.semicolons !== undefined) confidence.semicolons = 1.0;

  return {
    fileNaming: fileNamingResult.value,
    componentPattern,
    exportStyle,
    testLocation: hasTests ? testLocation : "colocated",
    indentation,
    indentSize: finalIndentSize,
    semicolons,
    quotes,
    confidence,
  };
}
