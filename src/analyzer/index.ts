import type { CodebaseContext } from "../rules/index.js";
import { detectStack } from "./stack.js";
import { detectConventions } from "./conventions.js";
import { detectStructure } from "./structure.js";
import { detectDependencies } from "./dependencies.js";

export async function analyzeCodebase(
  projectPath: string,
  depth = 3,
): Promise<CodebaseContext> {
  const [stack, conventions, structure, dependencies] = await Promise.all([
    detectStack(projectPath),
    detectConventions(projectPath),
    detectStructure(projectPath, depth),
    detectDependencies(projectPath),
  ]);

  const context: CodebaseContext = {};
  if (stack) context.stack = stack;
  if (conventions) context.conventions = conventions;
  if (structure) context.structure = structure;
  if (dependencies) context.dependencies = dependencies;

  return context;
}

export { detectStack } from "./stack.js";
export { detectConventions } from "./conventions.js";
export { detectStructure } from "./structure.js";
export { detectDependencies } from "./dependencies.js";
