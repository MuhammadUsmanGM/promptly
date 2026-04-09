export type {
  Rule,
  CodebaseContext,
  StackInfo,
  ConventionInfo,
  StructureInfo,
  DependencyInfo,
  DependencyEntry,
} from "./universal.js";

export { universalRules } from "./universal.js";
export { claudeCodeRules } from "./claude-code.js";
export { cursorRules } from "./cursor.js";
export { geminiRules } from "./gemini.js";

import { universalRules } from "./universal.js";
import { claudeCodeRules } from "./claude-code.js";
import { cursorRules } from "./cursor.js";
import { geminiRules } from "./gemini.js";
import type { Rule, CodebaseContext } from "./universal.js";

export type Agent = "claude_code" | "cursor" | "gemini_cli" | "generic";

export function getRulesForAgent(agent: Agent): Rule[] {
  switch (agent) {
    case "claude_code":
      return [...universalRules, ...claudeCodeRules];
    case "cursor":
      return [...universalRules, ...cursorRules];
    case "gemini_cli":
      return [...universalRules, ...geminiRules];
    case "generic":
    default:
      return [...universalRules];
  }
}

export function refinePrompt(
  rawPrompt: string,
  context: CodebaseContext,
  agent: Agent = "generic"
): { refined: string; rulesApplied: string[] } {
  const rules = getRulesForAgent(agent);
  let refined = rawPrompt;
  const rulesApplied: string[] = [];

  for (const rule of rules) {
    const before = refined;
    refined = rule.apply(refined, context);
    if (refined !== before) {
      rulesApplied.push(rule.name);
    }
  }

  return { refined, rulesApplied };
}

export function getRulesDescription(agent: Agent = "generic"): string {
  const rules = getRulesForAgent(agent);
  return rules
    .map((r, i) => `${i + 1}. **${r.name}**: ${r.description}`)
    .join("\n");
}
