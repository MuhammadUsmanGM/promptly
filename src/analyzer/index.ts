import type { CodebaseContext } from "../rules/index.js";
import type { Agent } from "../rules/index.js";
import { detectStack } from "./stack.js";
import { detectConventions } from "./conventions.js";
import { detectStructure } from "./structure.js";
import { detectDependencies } from "./dependencies.js";
import { resolveAnalysisRoot, labelForRoot } from "./workspace.js";
import { loadUserRules } from "./userRules.js";

export interface AnalyzeOptions {
  depth?: number;
  // Files the user referenced (or the agent is looking at). Used to pick the right
  // sub-package in a monorepo. Can be absolute or relative to projectPath.
  hints?: string[];
  // Which agent we're refining for — drives which instruction file (CLAUDE.md,
  // .cursorrules, GEMINI.md, QWEN.md) we look for user-authored rules in.
  agent?: Agent;
}

export async function analyzeCodebase(
  projectPath: string,
  depthOrOptions: number | AnalyzeOptions = 3,
): Promise<CodebaseContext> {
  const options: AnalyzeOptions = typeof depthOrOptions === "number"
    ? { depth: depthOrOptions }
    : depthOrOptions;
  const depth = options.depth ?? 3;
  const hints = options.hints ?? [];
  const agent: Agent = options.agent ?? "generic";

  // In a monorepo, narrow to the sub-package the prompt is most likely about.
  // Outside monorepos this is a no-op and analysisRoot === projectPath.
  const resolved = await resolveAnalysisRoot(projectPath, hints);
  const target = resolved.analysisRoot;

  const [stack, conventions, structure, dependencies, userRules] = await Promise.all([
    detectStack(target),
    detectConventions(target),
    detectStructure(target, depth),
    detectDependencies(target),
    loadUserRules(target, projectPath, agent),
  ]);

  const context: CodebaseContext = {};
  if (stack) context.stack = stack;
  if (conventions) context.conventions = conventions;
  if (structure) context.structure = structure;
  if (dependencies) context.dependencies = dependencies;
  if (userRules) {
    context.userRules = {
      source: userRules.source,
      content: userRules.content,
      truncated: userRules.truncated,
    };
  }

  // Always surface workspace info when we're in a monorepo, even if we didn't narrow,
  // so the agent can tell the user "I analyzed the root — pass a file path to target
  // a specific package".
  if (resolved.workspace.isMonorepo) {
    context.workspace = {
      isMonorepo: true,
      tool: resolved.workspace.tool,
      analysisRoot: target,
      analysisRootLabel: labelForRoot(target, resolved.workspace),
      isSubPackage: resolved.isSubPackage,
      packageCount: resolved.workspace.packages.length,
    };
  }

  return context;
}

export { detectStack } from "./stack.js";
export { detectConventions } from "./conventions.js";
export { detectStructure } from "./structure.js";
export { detectDependencies } from "./dependencies.js";
export { detectWorkspace, resolveAnalysisRoot } from "./workspace.js";
export { loadUserRules } from "./userRules.js";
