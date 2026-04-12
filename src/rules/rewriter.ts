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
      return raw; // explain prompts pass through untouched
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
    const relevant = guessRelevantDirs(raw, ctx.structure.keyDirs);
    if (relevant) {
      parts.push(`Place files in ${relevant}.`);
    }
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

  // Package constraint
  parts.push("Do not install new packages unless explicitly requested.");

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
  // Light touch — just add stack context if missing
  let action = ensureImperative(raw, agent);

  if (ctx.stack?.framework && !mentionsAny(raw, [ctx.stack.framework])) {
    action = `${action} (${ctx.stack.framework} project, ${ctx.stack.language ?? ""})`.replace(/, \)/, ")");
  }

  return action;
}

// --- Convention scoping ---

type ConventionScope = "full" | "style_only" | "none";

// --- Helpers ---

function ensureImperative(prompt: string, agent: Agent): string {
  if (agent !== "claude_code" && agent !== "gemini_cli") return prompt;

  const imperative = [
    "create", "add", "fix", "refactor", "update", "remove",
    "delete", "implement", "build", "write", "move", "rename",
    "extract", "replace", "configure", "set up", "install",
    "explain", "describe",
  ];
  const firstWord = prompt.trim().split(/\s/)[0].toLowerCase();
  if (imperative.includes(firstWord)) return prompt;
  return `Task: ${prompt}`;
}

function mentionsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => t && lower.includes(t.toLowerCase()));
}

function guessRelevantDirs(prompt: string, keyDirs: Record<string, string>): string | null {
  const lower = prompt.toLowerCase();

  // Map prompt keywords to directory purposes
  const hints: Record<string, string[]> = {
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
    "auth": ["Auth", "Middleware"],
    "database": ["Database layer"],
    "store": ["State management"],
    "type": ["Type definitions"],
  };

  for (const [keyword, purposes] of Object.entries(hints)) {
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

function formatConventionsAsInstructions(
  c: CodebaseContext["conventions"],
  scope: ConventionScope = "full",
): string {
  if (!c || scope === "none") return "";

  const bits: string[] = [];

  // File naming only for "full" scope (creating new files)
  if (scope === "full" && c.fileNaming !== "mixed") bits.push(`${c.fileNaming} file names`);

  // Code style conventions for both "full" and "style_only"
  if (c.exportStyle !== "mixed") bits.push(`${c.exportStyle} exports`);
  if (c.componentPattern && c.componentPattern !== "mixed") bits.push(`${c.componentPattern} components`);
  bits.push(`${c.quotes} quotes`);
  bits.push(c.semicolons ? "semicolons" : "no semicolons");

  return bits.length > 0 ? `Use ${bits.join(", ")}.` : "";
}
