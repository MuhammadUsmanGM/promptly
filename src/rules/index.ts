export type {
  CodebaseContext,
  StackInfo,
  ConventionInfo,
  ConventionConfidence,
  StructureInfo,
  DependencyInfo,
  DependencyEntry,
  WorkspaceContext,
  UserRulesContext,
} from "./universal.js";

export type { Intent } from "./intent.js";
export { detectIntent } from "./intent.js";

import { detectIntent } from "./intent.js";
import { rewritePrompt } from "./rewriter.js";
import type { CodebaseContext } from "./universal.js";
import type { Intent } from "./intent.js";

export type Agent = "claude_code" | "cursor" | "gemini_cli" | "qwen_code" | "generic";

export interface RefineSignals {
  // Files the agent said the user is actively working on (e.g. open buffers,
  // paths named in the prompt). Boost these in file-relevance scoring.
  targetFiles?: string[];
  // Files touched in recent git history. Same idea — likely relevant to the
  // current task. Gathered per-call since git state changes faster than the
  // analysis cache's TTL.
  recentFiles?: string[];
}

export function refinePrompt(
  rawPrompt: string,
  context: CodebaseContext,
  agent: Agent = "generic",
  signals: RefineSignals = {},
): { refined: string; intent: Intent } {
  const intent = detectIntent(rawPrompt);
  const refined = rewritePrompt(rawPrompt, intent, context, agent, signals);
  return { refined, intent };
}

export function getRulesDescription(agent: Agent = "generic"): string {
  const lines: string[] = [
    `Promptly refinement rules (${agent}):`,
    "",
    "**create** — Rewrites with stack/framework/styling, injects file location from project structure, bakes in full conventions (file naming, exports, quotes, components), adds test file requirement, constrains against unnecessary packages.",
    "",
    "**fix** — Adds stack context for debugging, constrains to minimal file changes, preserves existing tests and behavior, adds test verification. Skips convention injection to stay focused.",
    "",
    "**refactor** — Bakes in code style conventions (exports, quotes, semicolons — no file naming), constrains against behavior changes, adds test verification.",
    "",
    "**explain** — Passes through untouched.",
    "",
    "**configure** — Adds framework + package manager context, references config directory, specifies package manager for operations.",
    "",
    "**test** — Anchors on the detected test runner, points to files under test, enforces test-location convention (colocated/__tests__/test/), applies code style, and asks for happy+edge+error coverage without touching the code under test.",
  ];
  return lines.join("\n");
}
