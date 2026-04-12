import type { Intent } from "./intent.js";

export interface Rule {
  name: string;
  description: string;
  intents: Intent[] | "all";
  apply: (prompt: string, context: CodebaseContext) => string;
}

export interface CodebaseContext {
  stack?: StackInfo;
  conventions?: ConventionInfo;
  structure?: StructureInfo;
  dependencies?: DependencyInfo;
}

export interface StackInfo {
  language: string;
  framework?: string;
  styling?: string;
  orm?: string;
  packageManager: string;
  runtime?: string;
  testRunner?: string;
}

export interface ConventionInfo {
  namingConvention: "camelCase" | "snake_case" | "PascalCase" | "kebab-case" | "mixed";
  fileNaming: "camelCase" | "PascalCase" | "kebab-case" | "snake_case" | "mixed";
  componentPattern?: "functional" | "class" | "mixed";
  exportStyle: "named" | "default" | "mixed";
  testLocation: "colocated" | "__tests__" | "test_dir" | "spec";
  indentation: "tabs" | "spaces";
  indentSize?: number;
  semicolons: boolean;
  quotes: "single" | "double";
}

export interface StructureInfo {
  rootDirs: string[];
  keyDirs: Record<string, string>;
  totalFiles: number;
  tree: string;
}

export interface DependencyInfo {
  production: DependencyEntry[];
  development: DependencyEntry[];
  categories: Record<string, string[]>;
}

export interface DependencyEntry {
  name: string;
  version: string;
  category: string;
}

export const universalRules: Rule[] = [
  {
    name: "specificity",
    description: "Add tech stack context",
    intents: ["create", "fix", "refactor", "configure", "generic"],
    apply: (prompt, context) => {
      if (!context.stack) return prompt;

      const stackStr = [
        context.stack.framework,
        context.stack.language,
        context.stack.styling,
        context.stack.orm,
      ]
        .filter(Boolean)
        .join(", ");
      const frameworkName = context.stack.framework?.toLowerCase();
      const alreadyMentioned = frameworkName && prompt.toLowerCase().includes(frameworkName);
      if (stackStr && !alreadyMentioned) {
        return prompt + `\n\nTech stack: ${stackStr}`;
      }
      return prompt;
    },
  },
  {
    name: "file_scope",
    description: "Reference project structure for file location",
    intents: ["create", "configure"],
    apply: (prompt, context) => {
      if (!context.structure) return prompt;

      const relevantDirs = Object.entries(context.structure.keyDirs)
        .map(([dir, purpose]) => `  ${dir} — ${purpose}`)
        .join("\n");
      if (relevantDirs) {
        return prompt + `\n\nProject structure:\n${relevantDirs}`;
      }
      return prompt;
    },
  },
  {
    name: "conventions",
    description: "Enforce existing code conventions",
    intents: ["create", "refactor"],
    apply: (prompt, context) => {
      if (!context.conventions) return prompt;

      const c = context.conventions;
      const conventions = [
        `Naming: ${c.namingConvention}`,
        `File naming: ${c.fileNaming}`,
        `Exports: ${c.exportStyle}`,
        `Quotes: ${c.quotes}`,
        c.semicolons ? "Semicolons: yes" : "Semicolons: no",
        c.componentPattern ? `Components: ${c.componentPattern}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return prompt + `\n\nFollow existing conventions: ${conventions}`;
    },
  },
  {
    name: "constraints_create",
    description: "Constraints for creating new code",
    intents: ["create"],
    apply: (prompt) => {
      return prompt + "\n\nConstraints: Use existing patterns and utilities already in the codebase. Do not install new packages unless explicitly requested. Match existing code style.";
    },
  },
  {
    name: "constraints_fix",
    description: "Constraints for bug fixes — minimal touch",
    intents: ["fix"],
    apply: (prompt) => {
      return prompt + "\n\nConstraints: Touch minimal files. Do not refactor unrelated code. Do not change behavior beyond the fix. Preserve existing tests.";
    },
  },
  {
    name: "constraints_refactor",
    description: "Constraints for refactoring — no behavior change",
    intents: ["refactor"],
    apply: (prompt) => {
      return prompt + "\n\nConstraints: Do not change external behavior. All existing tests must still pass. Do not rename public APIs unless explicitly requested.";
    },
  },
  {
    name: "success_criteria",
    description: "Define verification steps",
    intents: ["create", "fix", "refactor", "configure"],
    apply: (prompt, context) => {
      if (context.stack?.testRunner) {
        return prompt + `\n\nVerify by running tests with ${context.stack.testRunner}.`;
      }
      return prompt;
    },
  },
];
