import type { CodebaseContext } from "./universal.js";
import type { Intent } from "./intent.js";
import type { Agent, RefineSignals } from "./index.js";

// Builds a single rewritten prompt — not appending footnotes, actually rewriting

export function rewritePrompt(
  raw: string,
  intent: Intent,
  context: CodebaseContext,
  agent: Agent,
  signals: RefineSignals = {},
): string {
  const body = (() => {
    switch (intent) {
      case "create":
        return rewriteCreate(raw, context, agent, signals);
      case "fix":
        return rewriteFix(raw, context, agent, signals);
      case "refactor":
        return rewriteRefactor(raw, context, agent, signals);
      case "explain":
        return rewriteExplain(raw, context, signals);
      case "configure":
        return rewriteConfigure(raw, context, agent);
      case "test":
        return rewriteTest(raw, context, agent, signals);
      case "generic":
        return rewriteGeneric(raw, context, agent, signals);
    }
  })();

  // Order matters: user rules first (they're ground truth and should take precedence),
  // then workspace scoping, then the refined prompt body.
  const preludes: string[] = [];
  const userRulesBlock = buildUserRulesBlock(context);
  if (userRulesBlock) preludes.push(userRulesBlock);
  const workspaceNote = buildWorkspacePrelude(context);
  if (workspaceNote) preludes.push(workspaceNote);

  return preludes.length > 0 ? `${preludes.join("\n\n")}\n\n${body}` : body;
}

function buildUserRulesBlock(ctx: CodebaseContext): string {
  const rules = ctx.userRules;
  if (!rules) return "";
  // Strip leading markdown headers ("# Project Guidelines") to save tokens — the
  // agent doesn't need them to understand the content. Keep interior headers intact
  // since they structure the rules.
  const trimmed = rules.content.replace(/^#[^\n]*\n+/, "").trim();
  const suffix = rules.truncated ? "\n[…rules truncated]" : "";
  const filename = rules.source.split(/[/\\]/).pop() ?? rules.source;
  return `[User rules from ${filename} — these override anything below when they conflict]\n${trimmed}${suffix}`;
}

function buildWorkspacePrelude(ctx: CodebaseContext): string {
  const ws = ctx.workspace;
  if (!ws?.isMonorepo) return "";
  if (ws.isSubPackage) {
    return `[Monorepo — analysis scoped to ${ws.analysisRootLabel} (${ws.tool}).]`;
  }
  return `[Monorepo detected (${ws.tool}, ${ws.packageCount} packages). No sub-package hint — context is from the repo root. Pass target_files to narrow.]`;
}

function rewriteCreate(raw: string, ctx: CodebaseContext, agent: Agent, signals: RefineSignals = {}): string {
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
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);
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

function rewriteFix(raw: string, ctx: CodebaseContext, agent: Agent, signals: RefineSignals = {}): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  // Add stack only if relevant for debugging context
  if (ctx.stack?.framework && !mentionsAny(raw, [ctx.stack.framework])) {
    action = `${action} (${ctx.stack.framework}, ${ctx.stack.language ?? ""})`.replace(/, \)/, ")");
  }
  parts.push(action);

  // Point the agent to likely relevant files
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);
  if (relevantFiles.length > 0) {
    parts.push(`Start investigating in: ${relevantFiles.join(", ")}.`);
  }

  parts.push("Touch only the files necessary for the fix. Do not refactor surrounding code. Do not change unrelated behavior. Preserve all existing tests.");

  if (ctx.stack?.testRunner) {
    parts.push(`Verify the fix passes existing tests with ${ctx.stack.testRunner}.`);
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteRefactor(raw: string, ctx: CodebaseContext, agent: Agent, signals: RefineSignals = {}): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);
  parts.push(action);

  // Point to files likely involved in the refactor
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);
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

function rewriteExplain(raw: string, ctx: CodebaseContext, signals: RefineSignals = {}): string {
  // Unlike other intents, we do NOT rewrite the user's question — they phrased it
  // the way they want an answer. Our job is to give the model enough orientation
  // (stack, codebase map, likely files) that the explanation is actually grounded
  // in this repo instead of generic framework knowledge.
  const preludeLines: string[] = [];

  // 1. Stack summary — one line. Skip if the prompt already names the framework,
  //    since "explain how Next.js routing works in this app" doesn't need us to
  //    restate "This is a Next.js codebase".
  if (ctx.stack) {
    const { framework, language } = ctx.stack;
    const mentioned = mentionsAny(raw, [framework, language].filter(Boolean) as string[]);
    if (!mentioned && (framework || language)) {
      const bits: string[] = [];
      if (framework) bits.push(framework);
      if (language) bits.push(language);
      preludeLines.push(`Codebase: ${bits.join(" / ")}.`);
    }
  }

  // 2. Key areas map — directory → purpose. Massively useful for "how does X work"
  //    questions in an unfamiliar codebase. Cap at 8 entries so the prelude doesn't
  //    drown the question; prioritize src/* entries (usually the interesting ones).
  const keyDirs = ctx.structure?.keyDirs;
  if (keyDirs && Object.keys(keyDirs).length > 0) {
    const entries = Object.entries(keyDirs);
    entries.sort(([a], [b]) => {
      const aSrc = a.startsWith("src/") ? 0 : 1;
      const bSrc = b.startsWith("src/") ? 0 : 1;
      if (aSrc !== bSrc) return aSrc - bSrc;
      return a.localeCompare(b);
    });
    const mapped = entries.slice(0, 8).map(([dir, purpose]) => `${dir} (${purpose})`);
    preludeLines.push(`Key areas: ${mapped.join(", ")}.`);
  }

  // 3. Files most likely to be the subject of the question. Keep the original
  //    "Relevant files to look at" wording since it already reads naturally after
  //    the question.
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);

  if (preludeLines.length === 0 && relevantFiles.length === 0) return raw;

  const prelude = preludeLines.length > 0 ? `${preludeLines.join(" ")}\n\n` : "";
  const suffix = relevantFiles.length > 0 ? ` Relevant files to look at: ${relevantFiles.join(", ")}.` : "";
  return `${prelude}${raw}${suffix}`;
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

function rewriteTest(raw: string, ctx: CodebaseContext, agent: Agent, signals: RefineSignals = {}): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  // Anchor on the actual test runner — this is the #1 thing the agent needs.
  if (ctx.stack?.testRunner && !mentionsAny(raw, [ctx.stack.testRunner])) {
    action = `${action} using ${ctx.stack.testRunner}`;
  }
  parts.push(action);

  // Point at the code being tested so the agent doesn't guess
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);
  if (relevantFiles.length > 0) {
    parts.push(`Files under test: ${relevantFiles.join(", ")}.`);
  }

  // Test file placement — colocated vs __tests__ vs test/
  const testLoc = ctx.conventions?.testLocation;
  if (ctx.stack?.testRunner) {
    const placement = testLoc === "__tests__"
      ? `Place tests in a __tests__/ directory next to the source.`
      : testLoc === "test_dir"
        ? `Place tests in the top-level test/ directory.`
        : testLoc === "spec"
          ? `Use .spec.* filenames alongside the source.`
          : `Colocate test files with the source (foo.ts → foo.test.ts).`;
    parts.push(placement);
  }

  // Style consistency inside the test file — quotes, semis, exports matter.
  if (ctx.conventions) {
    parts.push(formatConventionsAsInstructions(ctx.conventions, "style_only"));
  }

  parts.push("Cover happy path, edge cases, and error paths. Do not modify the code under test unless a bug is found — flag it instead.");

  if (ctx.stack?.testRunner) {
    parts.push(`Verify the new tests pass with ${ctx.stack.testRunner}.`);
  }

  return parts.filter(Boolean).join(" ");
}

function rewriteGeneric(raw: string, ctx: CodebaseContext, agent: Agent, signals: RefineSignals = {}): string {
  const parts: string[] = [];

  let action = ensureImperative(raw, agent);

  if (ctx.stack?.framework && !mentionsAny(raw, [ctx.stack.framework])) {
    action = `${action} (${ctx.stack.framework}, ${ctx.stack.language ?? ""})`.replace(/, \)/, ")");
  }
  parts.push(action);

  // Point to relevant files if any match
  const relevantFiles = findRelevantFiles(raw, ctx.structure, signals);
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
  // "can you add dark mode" → "Add dark mode"
  // "we should refactor auth" → "Refactor auth"
  // Only rewrite if the action verb is near the start (within first 50 chars)
  // to avoid dropping important context from longer prompts
  const actionMatch = prompt.match(
    /^.{0,50}?\b(create|add|fix|refactor|update|remove|delete|implement|build|write|move|rename|extract|replace|configure|set up|install)\b\s+(.+)/is,
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
  signals: RefineSignals = {},
): string[] {
  if (!structure) return [];

  const keywords = extractPromptKeywords(prompt);
  const targetSet = normalizeSignalFiles(signals.targetFiles);
  const contextSet = normalizeSignalFiles(signals.contextFiles);
  const recentSet = normalizeSignalFiles(signals.recentFiles);

  // If there's nothing to score against at all (no keywords AND no signals),
  // we can't pick anything.
  if (
    keywords.length === 0 &&
    targetSet.size === 0 &&
    contextSet.size === 0 &&
    recentSet.size === 0
  ) {
    return [];
  }

  const scored = new Map<string, number>();

  // Score files by keyword matches in their path
  if (structure.files && keywords.length > 0) {
    for (const filePath of structure.files) {
      const lower = filePath.toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        const segments = lower.split(/[/.\-_]/);
        if (segments.some((s) => s === kw)) {
          score += 3;
        } else if (lower.includes(kw)) {
          score += 1;
        }
      }

      if (score > 0) scored.set(filePath, score);
    }
  }

  // Boost files that are already scored AND live in a keyword-matching directory
  if (structure.keyDirs && keywords.length > 0) {
    for (const kw of keywords) {
      for (const [dir, purpose] of Object.entries(structure.keyDirs)) {
        const dirLower = dir.toLowerCase();
        const purposeLower = purpose.toLowerCase();
        if (dirLower.includes(kw) || purposeLower.includes(kw)) {
          for (const [filePath, score] of scored.entries()) {
            if (filePath.startsWith(dir + "/")) {
              scored.set(filePath, score + 2);
            }
          }
        }
      }
    }
  }

  // Signal boosts — priors for "this is the area you should look at". Three
  // sources ordered by how direct the signal is:
  //   target_files  (5): agent said "the prompt is about these"
  //   context_files (3): agent said "these are on the user's screen right now"
  //   recent git    (2): we inferred from commit history
  // These can also seed results when keyword matching comes up empty (e.g. vague
  // prompts like "finish what I was doing"). Boosts stack if a file is in
  // multiple buckets.
  const TARGET_BOOST = 5;
  const CONTEXT_BOOST = 3;
  const RECENT_BOOST = 2;
  const candidates = structure.files ?? [];
  for (const filePath of candidates) {
    const lower = filePath.toLowerCase();
    let bonus = 0;
    if (matchesSignal(lower, targetSet)) bonus += TARGET_BOOST;
    if (matchesSignal(lower, contextSet)) bonus += CONTEXT_BOOST;
    if (matchesSignal(lower, recentSet)) bonus += RECENT_BOOST;
    if (bonus > 0) {
      scored.set(filePath, (scored.get(filePath) ?? 0) + bonus);
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

function normalizeSignalFiles(files: string[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!files) return out;
  for (const raw of files) {
    if (!raw) continue;
    // Normalize separators, drop leading ./, lowercase for comparison
    const norm = raw.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    if (norm.length > 0) out.add(norm);
  }
  return out;
}

function matchesSignal(filePathLower: string, signalSet: Set<string>): boolean {
  if (signalSet.size === 0) return false;
  if (signalSet.has(filePathLower)) return true;
  // Loose match — structure.files are repo-relative, but signals may be absolute
  // paths or end-fragments. Use suffix match in both directions.
  for (const sig of signalSet) {
    if (sig.endsWith(filePathLower) || filePathLower.endsWith(sig)) return true;
  }
  return false;
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
