interface Rule {
    name: string;
    description: string;
    apply: (prompt: string, context: CodebaseContext) => string;
}
interface CodebaseContext {
    stack?: StackInfo;
    conventions?: ConventionInfo;
    structure?: StructureInfo;
    dependencies?: DependencyInfo;
}
interface StackInfo {
    language: string;
    framework?: string;
    styling?: string;
    orm?: string;
    packageManager: string;
    runtime?: string;
    testRunner?: string;
}
interface ConventionInfo {
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
interface StructureInfo {
    rootDirs: string[];
    keyDirs: Record<string, string>;
    totalFiles: number;
    tree: string;
}
interface DependencyInfo {
    production: DependencyEntry[];
    development: DependencyEntry[];
    categories: Record<string, string[]>;
}
interface DependencyEntry {
    name: string;
    version: string;
    category: string;
}
declare const universalRules: Rule[];

declare const claudeCodeRules: Rule[];

declare const cursorRules: Rule[];

declare const geminiRules: Rule[];

type Agent = "claude_code" | "cursor" | "gemini_cli" | "generic";
declare function getRulesForAgent(agent: Agent): Rule[];
declare function refinePrompt(rawPrompt: string, context: CodebaseContext, agent?: Agent): {
    refined: string;
    rulesApplied: string[];
};
declare function getRulesDescription(agent?: Agent): string;

export { type Agent, type CodebaseContext, type ConventionInfo, type DependencyEntry, type DependencyInfo, type Rule, type StackInfo, type StructureInfo, claudeCodeRules, cursorRules, geminiRules, getRulesDescription, getRulesForAgent, refinePrompt, universalRules };
