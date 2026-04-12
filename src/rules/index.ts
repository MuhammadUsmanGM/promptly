export type {
  CodebaseContext,
  StackInfo,
  ConventionInfo,
  StructureInfo,
  DependencyInfo,
  DependencyEntry,
} from "./universal.js";

export type { Intent } from "./intent.js";
export { detectIntent } from "./intent.js";

import { detectIntent } from "./intent.js";
import { rewritePrompt } from "./rewriter.js";
import type { CodebaseContext } from "./universal.js";
import type { Intent } from "./intent.js";

export type Agent = "claude_code" | "cursor" | "gemini_cli" | "generic";

export function refinePrompt(
  rawPrompt: string,
  context: CodebaseContext,
  agent: Agent = "generic"
): { refined: string; intent: Intent } {
  const intent = detectIntent(rawPrompt);
  const refined = rewritePrompt(rawPrompt, intent, context, agent);
  return { refined, intent };
}

export function getRulesDescription(agent: Agent = "generic"): string {
  const lines: string[] = [
    `Promptly refinement rules (${agent}):`,
    "",
    "**create** — Rewrites with stack/framework/styling, injects file location from project structure, bakes in naming/export/quote conventions, adds test file requirement, constrains against unnecessary packages.",
    "",
    "**fix** — Adds stack context for debugging, constrains to minimal file changes, preserves existing tests and behavior, adds test verification.",
    "",
    "**refactor** — Bakes in code conventions, constrains against behavior changes, adds test verification.",
    "",
    "**explain** — Passes through untouched.",
    "",
    "**configure** — Adds framework + package manager context, references config directory, specifies package manager for operations.",
  ];
  return lines.join("\n");
}
