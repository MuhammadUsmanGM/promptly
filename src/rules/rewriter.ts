import type { CodebaseContext } from "./universal.js";
import type { Intent } from "./intent.js";
import type { Agent } from "./index.js";

// Builds a single rewritten prompt — not appending footnotes, actually rewriting

export function rewritePrompt(
  raw: string,
  intent: Intent,
  context: CodebaseContext,
  agent: Agent,
): string {
  switch (intent) {
    case "create":
      return rewriteCreate(raw, context, agent);
    case "fix":
      return rewriteFix(raw, context, agent);
    case "refactor":
      return rewriteRefactor(raw, context, agent);
    case "explain":
      return rewriteExplain(raw, context);
    case "configure":
      return rewriteConfigure(raw, context, agent);
    case "generic":
      return rewriteGeneric(raw, context, agent);
  }
}

function rewriteCreate(raw: string, ctx: CodebaseContext, agent: Agent): string {
  const parts: string[] = [];

  // Rewrite the action line with concrete details
  let action = ensureImperative(raw, agent);

  // Inject framework + language into the action
  if (ctx.stack) {
    const { framework, language, styling } = ctx.stack;
    const stackBits: string[] = [];
    if (framework && !mentionsAny(raw, [framework])) stackBits.push(`using ${framework}`);
    if (language && !mentionsAny(raw, [language])) stackBits.push(language);
    if (styling && !mentionsAny(raw, [styling])) stackBits.push(`styled with ${styling}`);
    if (stackBits.length > 0) {
      action = `${action} (${stackBits.join(", ")})`;
    }
  }
  parts.push(action);

  // File location guidance from structure
  if (ctx.structure?.keyDirs && Object.keys(ctx.structure.keyDirs).length > 0) {
    const targetDir = findRelevantDir(raw, ctx.structure.keyDirs);
    if (targetDir) {
      parts.push(`Place files in ${targetDir}.`);
    }
  }

  // Relevant existing files the agent should be aware of
  const relevantFiles = findRelevantFiles(raw, ctx.structure);
  if (relevantFiles.length > 0) {
    parts.push(`Relevant existing files: ${relevantFiles.join(", ")}.`);
  }

  // Concrete conventions — baked into instructions, not a list
  if (ctx.conventions) {
    parts.push(formatConventionsAsInstructions(ctx.conventions));
  }

  // Test file
  if (ctx.stack?.testRunner) {
    const testLoc = ctx.conventions?.testLocation;
    const testHint = testLoc === "__tests__"
      ? `Add tests in a __tests__/ directory using ${ctx.stack.testRunner}.`
      : testLoc === "test_dir"
        ? `Add tests in the test/ directory using ${ctx.stack.testRunner}.`
        : `Add a colocated test file using ${ctx.stack.testRunner}.`;
    parts.push(testHint);
  }

  // Package constraint — skip if the user is explicitly asking to install something
  const installWords = /\b(install|add\s+package|add\s+dep|set\s*up|integrate)\b/i;
  if (!installWords.test(raw)) {
    parts.push("Do not install new packages unless explicitly requested.");
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteFix(raw: string, ctx: CodebaseContext, agent: Agent): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  // Add stack only if relevant for debugging context
  if (ctx.stack?.framework && !mentionsAny(raw, [ctx.stack.framework])) {
    action = `${action} (${ctx.stack.framework}, ${ctx.stack.language ?? ""})`.replace(/, \)/, ")");
  }
  parts.push(action);

  // Point the agent to likely relevant files
  const relevantFiles = findRelevantFiles(raw, ctx.structure);
  if (relevantFiles.length > 0) {
    parts.push(`Start investigating in: ${relevantFiles.join(", ")}.`);
  }

  parts.push("Touch only the files necessary for the fix. Do not refactor surrounding code. Do not change unrelated behavior. Preserve all existing tests.");

  if (ctx.stack?.testRunner) {
    parts.push(`Verify the fix passes existing tests with ${ctx.stack.testRunner}.`);
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteRefactor(raw: string, ctx: CodebaseContext, agent: Agent): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);
  parts.push(action);

  // Point to files likely involved in the refactor
  const relevantFiles = findRelevantFiles(raw, ctx.structure);
  if (relevantFiles.length > 0) {
    parts.push(`Likely files to refactor: ${relevantFiles.join(", ")}.`);
  }

  // Code style matters for refactoring, but not file naming
  if (ctx.conventions) {
    parts.push(formatConventionsAsInstructions(ctx.conventions, "style_only"));
  }

  parts.push("Do not change external behavior or public APIs. All existing tests must still pass.");

  if (ctx.stack?.testRunner) {
    parts.push(`Run ${ctx.stack.testRunner} to verify nothing breaks.`);
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteExplain(raw: string, ctx: CodebaseContext): string {
  const relevantFiles = findRelevantFiles(raw, ctx.structure);
  if (relevantFiles.length === 0) return raw;
  return `${raw} Relevant files to look at: ${relevantFiles.join(", ")}.`;
}

function rewriteConfigure(raw: string, ctx: CodebaseContext, agent: Agent): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  if (ctx.stack) {
    const bits: string[] = [];
    if (ctx.stack.framework && !mentionsAny(raw, [ctx.stack.framework])) bits.push(ctx.stack.framework);
    if (ctx.stack.packageManager) bits.push(`${ctx.stack.packageManager}`);
    if (bits.length > 0) {
      action = `${action} for ${bits.join(" with ")}`;
    }
  }
  parts.push(action);

  // Structure helps know where configs live
  if (ctx.structure?.keyDirs && Object.keys(ctx.structure.keyDirs).length > 0) {
    const configDir = Object.entries(ctx.structure.keyDirs)
      .find(([, purpose]) => purpose.toLowerCase().includes("config"));
    if (configDir) {
      parts.push(`Configuration files live in ${configDir[0]}.`);
    }
  }

  if (ctx.stack?.packageManager) {
    parts.push(`Use ${ctx.stack.packageManager} for any package operations.`);
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteGeneric(raw: string, ctx: CodebaseContext, agent: Agent): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  if (ctx.stack?.framework && !mentionsAny(raw, [ctx.stack.framework])) {
    action = `${action} (${ctx.stack.framework}, ${ctx.stack.language ?? ""})`.replace(/, \)/, ")");
  }
  parts.push(action);

  // Point to relevant files if any match
  const relevantFiles = findRelevantFiles(raw, ctx.structure);
  if (relevantFiles.length > 0) {
    parts.push(`Relevant files: ${relevantFiles.join(", ")}.`);
  }

  // Apply style conventions if confident
  if (ctx.conventions) {
    parts.push(formatConventionsAsInstructions(ctx.conventions, "style_only"));
  }

  return parts.filter(Boolean).join(" ");
}

// --- Convention scoping ---

type ConventionScope = "full" | "style_only" | "none";

// --- Helpers ---

function ensureImperative(prompt: string, agent: Agent): string {
  if (agent !== "claude_code" && agent !== "gemini_cli" && agent !== "qwen_code") return prompt;

  const imperative = [
    "create", "add", "fix", "refactor", "update", "remove",
    "delete", "implement", "build", "write", "move", "rename",
    "extract", "replace", "configure", "set up", "install",
    "explain", "describe",
  ];
  const firstWord = prompt.trim().split(/\s/)[0].toLowerCase();
  if (imperative.includes(firstWord)) return prompt;

  // Try to extract the actual action from conversational phrasing
  // "I need a login form" → "Create a login form"
  // "can you add dark mode" → "add dark mode"
  // "we should refactor auth" → "refactor auth"
  const actionMatch = prompt.match(
    /\b(create|add|fix|refactor|update|remove|delete|implement|build|write|move|rename|extract|replace|configure|set up|install)\b\s+(.+)/i,
  );
  if (actionMatch) {
    return `${actionMatch[1].charAt(0).toUpperCase() + actionMatch[1].slice(1)} ${actionMatch[2]}`;
  }

  // "I need X" / "I want X" → "Create X"
  const needMatch = prompt.match(/\b(?:i\s+)?(?:need|want)\s+(?:a\s+|an\s+|the\s+)?(.+)/i);
  if (needMatch) {
    return `Create ${needMatch[1]}`;
  }

  // No rewrite possible — return as-is rather than ugly "Task:" prefix
  return prompt;
}

function mentionsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => t && lower.includes(t.toLowerCase()));
}

// --- File relevance detection ---

// Maps prompt keywords to directory purposes (for dir-level matching)
const DIR_HINTS: Record<string, string[]> = {
  "component": ["UI components", "components"],
  "page": ["Pages", "Page components"],
  "hook": ["Custom hooks"],
  "util": ["Utility functions"],
  "api": ["API layer"],
  "route": ["Route definitions"],
  "service": ["Service layer"],
  "model": ["Data models"],
  "schema": ["Validation schemas"],
  "middleware": ["Middleware"],
  "style": ["Stylesheets"],
  "test": ["Tests"],
  "config": ["Configuration"],
  "migration": ["Database migrations"],
  "database": ["Database layer"],
  "store": ["State management"],
  "type": ["Type definitions"],
};

// Domain keywords that appear in filenames (e.g., "auth" → auth.ts, useAuth.ts, AuthProvider.tsx)
const DOMAIN_KEYWORDS = [
  "auth", "login", "signup", "register", "session", "token",
  "user", "profile", "account", "settings", "preferences",
  "cart", "checkout", "payment", "order", "invoice",
  "dashboard", "admin", "analytics",
  "nav", "navbar", "header", "footer", "sidebar", "layout",
  "modal", "dialog", "form", "table", "list",
  "notification", "email", "message", "chat",
  "search", "filter", "sort", "pagination",
  "upload", "image", "file", "media",
  "theme", "dark", "light",
  "error", "loading", "skeleton",
  "database", "db", "prisma", "migration",
  "api", "fetch", "http", "client", "server",
  "middleware", "guard", "interceptor",
  "route", "router", "redirect",
  "store", "state", "context", "provider", "reducer",
];

function extractPromptKeywords(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  // Split into actual words (min 3 chars to avoid noise)
  const words = lower.split(/[\s,.\-_/()]+/).filter((w) => w.length >= 3);

  const keywords: string[] = [];

  // 1. Domain keywords — use word boundary matching to avoid substring traps
  //    ("the" matching "theme", "or" matching "order", etc.)
  for (const dk of DOMAIN_KEYWORDS) {
    const regex = new RegExp(`\\b${dk}\\b`, "i");
    if (regex.test(lower) && !keywords.includes(dk)) keywords.push(dk);
  }

  // 2. Remaining meaningful words from the prompt (nouns/subjects only)
  const stopWords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into",
    "not", "but", "its", "are", "was", "has", "had", "will",
    "can", "should", "would", "could", "may", "use", "using",
    "add", "fix", "create", "make", "build", "implement", "update",
    "refactor", "move", "rename", "delete", "remove", "change",
    "explain", "describe", "how", "what", "why", "when", "where",
    "new", "all", "any", "each", "every", "some", "after",
    "before", "work", "working", "does", "doesn", "isn",
    "about", "like", "also", "just", "only", "more", "very",
    "been", "being", "have", "having", "need", "want",
    "page", "file", "code", "function", "method", "class",
    "component", "module", "package", "library", "directory",
    "mode", "flow", "way", "thing", "stuff", "results",
    "returning", "redirecting", "processing", "handling",
    "composition", "pattern", "approach", "logic", "system",
  ]);
  for (const w of words) {
    if (!stopWords.has(w) && !keywords.includes(w)) keywords.push(w);
  }

  return keywords;
}

function findRelevantFiles(
  prompt: string,
  structure: CodebaseContext["structure"],
): string[] {
  if (!structure) return [];

  const keywords = extractPromptKeywords(prompt);
  if (keywords.length === 0) return [];

  const scored = new Map<string, number>();

  // Score files by keyword matches in their path
  if (structure.files) {
    for (const filePath of structure.files) {
      const lower = filePath.toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        // Exact segment match (auth.ts, useAuth.tsx) scores higher
        const segments = lower.split(/[/.\-_]/);
        if (segments.some((s) => s === kw)) {
          score += 3;
        }
        // Partial match in path (authMiddleware.ts)
        else if (lower.includes(kw)) {
          score += 1;
        }
      }

      if (score > 0) scored.set(filePath, score);
    }
  }

  // Boost files that are already scored AND live in a keyword-matching directory
  if (structure.keyDirs) {
    for (const kw of keywords) {
      for (const [dir, purpose] of Object.entries(structure.keyDirs)) {
        const dirLower = dir.toLowerCase();
        const purposeLower = purpose.toLowerCase();
        if (dirLower.includes(kw) || purposeLower.includes(kw)) {
          // Only boost files that already have some relevance score
          for (const [filePath, score] of scored.entries()) {
            if (filePath.startsWith(dir + "/")) {
              scored.set(filePath, score + 2);
            }
          }
        }
      }
    }
  }

  // Return top results, filtered by minimum score, sorted descending, capped at 8
  const MIN_SCORE = 2;
  return [...scored.entries()]
    .filter(([, score]) => score >= MIN_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path]) => path);
}

function findRelevantDir(prompt: string, keyDirs: Record<string, string>): string | null {
  const lower = prompt.toLowerCase();
  for (const [keyword, purposes] of Object.entries(DIR_HINTS)) {
    if (lower.includes(keyword)) {
      for (const [dir, purpose] of Object.entries(keyDirs)) {
        if (purposes.some((p) => purpose.includes(p))) {
          return dir;
        }
      }
    }
  }
  return null;
}

const CONFIDENCE_THRESHOLD = 0.5; // only inject conventions above this confidence

function formatConventionsAsInstructions(
  c: CodebaseContext["conventions"],
  scope: ConventionScope = "full",
): string {
  if (!c || scope === "none") return "";

  const conf = c.confidence;
  const bits: string[] = [];

  // File naming only for "full" scope (creating new files)
  if (scope === "full" && c.fileNaming !== "mixed" && conf.fileNaming >= CONFIDENCE_THRESHOLD) {
    bits.push(`${c.fileNaming} file names`);
  }

  // Code style conventions for both "full" and "style_only"
  if (c.exportStyle !== "mixed" && conf.exports >= CONFIDENCE_THRESHOLD) {
    bits.push(`${c.exportStyle} exports`);
  }
  if (c.componentPattern && c.componentPattern !== "mixed" && conf.components >= CONFIDENCE_THRESHOLD) {
    bits.push(`${c.componentPattern} components`);
  }
  if (conf.quotes >= CONFIDENCE_THRESHOLD) {
    bits.push(`${c.quotes} quotes`);
  }
  if (conf.semicolons >= CONFIDENCE_THRESHOLD) {
    bits.push(c.semicolons ? "semicolons" : "no semicolons");
  }

  return bits.length > 0 ? `Use ${bits.join(", ")}.` : "";
}
