export interface CodebaseContext {
  stack?: StackInfo;
  conventions?: ConventionInfo;
  structure?: StructureInfo;
  dependencies?: DependencyInfo;
  workspace?: WorkspaceContext;
  userRules?: UserRulesContext;
}

export interface UserRulesContext {
  source: string;       // file the rules came from (e.g. CLAUDE.md)
  content: string;      // truncated rules text
  truncated: boolean;   // whether the source file was longer than our cap
}

export interface WorkspaceContext {
  isMonorepo: boolean;
  tool: "npm" | "yarn" | "pnpm" | "turbo" | "none";
  analysisRoot: string;       // absolute path that was analyzed
  analysisRootLabel: string;  // "." for repo root, or e.g. "apps/web" for a sub-package
  isSubPackage: boolean;      // true if analysis was narrowed into a sub-package
  packageCount: number;       // total number of packages in the workspace
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

export interface ConventionConfidence {
  naming: number;      // 0-1: how confident in namingConvention
  fileNaming: number;  // 0-1: how confident in fileNaming
  exports: number;     // 0-1: how confident in exportStyle
  components: number;  // 0-1: how confident in componentPattern
  semicolons: number;  // 0-1: how confident in semicolons
  quotes: number;      // 0-1: how confident in quotes
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
  confidence: ConventionConfidence;
}

export interface StructureInfo {
  rootDirs: string[];
  keyDirs: Record<string, string>;
  totalFiles: number;
  tree: string;
  files: string[]; // relative paths of source files (capped)
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
