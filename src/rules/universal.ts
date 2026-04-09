export interface Rule {
  name: string;
  description: string;
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
  keyDirs: Record<string, string>; // dir path -> purpose
  totalFiles: number;
  tree: string; // formatted tree string
}

export interface DependencyInfo {
  production: DependencyEntry[];
  development: DependencyEntry[];
  categories: Record<string, string[]>; // category -> package names
}

export interface DependencyEntry {
  name: string;
  version: string;
  category: string;
}

export const universalRules: Rule[] = [
  {
    name: "specificity",
    description: "Replace vague words with concrete specifics",
    apply: (prompt, context) => {
      let refined = prompt;

      // Add stack context if available
      if (context.stack) {
        const stackStr = [
          context.stack.framework,
          context.stack.language,
          context.stack.styling,
          context.stack.orm,
        ]
          .filter(Boolean)
          .join(", ");
        if (stackStr && !prompt.toLowerCase().includes(context.stack.framework?.toLowerCase() ?? "")) {
          refined += `\n\nTech stack: ${stackStr}`;
        }
      }

      return refined;
    },
  },
  {
    name: "file_scope",
    description: "Reference exact files and limit blast radius",
    apply: (prompt, context) => {
      let refined = prompt;

      if (context.structure) {
        const relevantDirs = Object.entries(context.structure.keyDirs)
          .map(([dir, purpose]) => `  ${dir} — ${purpose}`)
          .join("\n");
        if (relevantDirs) {
          refined += `\n\nProject structure:\n${relevantDirs}`;
        }
      }

      return refined;
    },
  },
  {
    name: "conventions",
    description: "Enforce existing code conventions",
    apply: (prompt, context) => {
      let refined = prompt;

      if (context.conventions) {
        const c = context.conventions;
        const conventions = [
          `Naming: ${c.namingConvention}`,
          `File naming: ${c.fileNaming}`,
          `Exports: ${c.exportStyle}`,
          `Quotes: ${c.quotes}`,
          c.semicolons ? "Semicolons: yes" : "Semicolons: no",
          c.componentPattern ? `Components: ${c.componentPattern}` : null,
          `Tests: ${c.testLocation}`,
        ]
          .filter(Boolean)
          .join(", ");
        refined += `\n\nFollow existing conventions: ${conventions}`;
      }

      return refined;
    },
  },
  {
    name: "constraints",
    description: "Add hard constraints to prevent scope creep",
    apply: (prompt) => {
      return (
        prompt +
        "\n\nConstraints: Preserve existing patterns. Do not install new packages unless explicitly requested. Do not break existing tests. Match existing code style. Minimize files changed."
      );
    },
  },
  {
    name: "success_criteria",
    description: "Define what done looks like",
    apply: (prompt, context) => {
      let refined = prompt;

      if (context.stack?.testRunner) {
        refined += `\n\nVerify by running tests with ${context.stack.testRunner}.`;
      }

      return refined;
    },
  },
];
