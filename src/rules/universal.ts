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
