// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/mcp/tools.ts
import { z } from "zod";

// src/analyzer/stack.ts
import { readFile } from "fs/promises";
import { join } from "path";
var FRAMEWORK_DETECTORS = {
  "Next.js": (pkg) => {
    const v = pkg.dependencies?.["next"] ?? pkg.devDependencies?.["next"];
    return v ? `Next.js ${v.replace(/[\^~]/, "")}` : null;
  },
  "React": (pkg) => {
    const v = pkg.dependencies?.["react"];
    return v && !pkg.dependencies?.["next"] ? `React ${v.replace(/[\^~]/, "")}` : null;
  },
  "Vue": (pkg) => {
    const v = pkg.dependencies?.["vue"];
    return v ? `Vue ${v.replace(/[\^~]/, "")}` : null;
  },
  "Svelte": (pkg) => {
    const v = pkg.dependencies?.["svelte"] ?? pkg.devDependencies?.["svelte"];
    return v ? `Svelte ${v.replace(/[\^~]/, "")}` : null;
  },
  "Nuxt": (pkg) => {
    const v = pkg.dependencies?.["nuxt"] ?? pkg.devDependencies?.["nuxt"];
    return v ? `Nuxt ${v.replace(/[\^~]/, "")}` : null;
  },
  "Express": (pkg) => {
    const v = pkg.dependencies?.["express"];
    return v ? `Express ${v.replace(/[\^~]/, "")}` : null;
  },
  "Fastify": (pkg) => {
    const v = pkg.dependencies?.["fastify"];
    return v ? `Fastify ${v.replace(/[\^~]/, "")}` : null;
  },
  "Hono": (pkg) => {
    const v = pkg.dependencies?.["hono"];
    return v ? `Hono ${v.replace(/[\^~]/, "")}` : null;
  },
  "Astro": (pkg) => {
    const v = pkg.dependencies?.["astro"] ?? pkg.devDependencies?.["astro"];
    return v ? `Astro ${v.replace(/[\^~]/, "")}` : null;
  },
  "Remix": (pkg) => {
    const v = pkg.dependencies?.["@remix-run/react"];
    return v ? `Remix ${v.replace(/[\^~]/, "")}` : null;
  },
  "Angular": (pkg) => {
    const v = pkg.dependencies?.["@angular/core"];
    return v ? `Angular ${v.replace(/[\^~]/, "")}` : null;
  }
};
var STYLING_DETECTORS = {
  "Tailwind CSS": (pkg) => !!(pkg.devDependencies?.["tailwindcss"] ?? pkg.dependencies?.["tailwindcss"]),
  "styled-components": (pkg) => !!pkg.dependencies?.["styled-components"],
  "Emotion": (pkg) => !!pkg.dependencies?.["@emotion/react"],
  "CSS Modules": () => false,
  // detected via file scan
  "Sass": (pkg) => !!(pkg.devDependencies?.["sass"] ?? pkg.dependencies?.["sass"])
};
var ORM_DETECTORS = {
  "Prisma": (pkg) => !!(pkg.devDependencies?.["prisma"] ?? pkg.dependencies?.["@prisma/client"]),
  "Drizzle": (pkg) => !!pkg.dependencies?.["drizzle-orm"],
  "TypeORM": (pkg) => !!pkg.dependencies?.["typeorm"],
  "Sequelize": (pkg) => !!pkg.dependencies?.["sequelize"],
  "Mongoose": (pkg) => !!pkg.dependencies?.["mongoose"],
  "Knex": (pkg) => !!pkg.dependencies?.["knex"]
};
var TEST_DETECTORS = {
  "Vitest": (pkg) => !!(pkg.devDependencies?.["vitest"] ?? pkg.dependencies?.["vitest"]),
  "Jest": (pkg) => !!(pkg.devDependencies?.["jest"] ?? pkg.dependencies?.["jest"]),
  "Mocha": (pkg) => !!pkg.devDependencies?.["mocha"],
  "Playwright": (pkg) => !!pkg.devDependencies?.["@playwright/test"],
  "Cypress": (pkg) => !!pkg.devDependencies?.["cypress"]
};
async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
function detectPackageManager(projectPath, pkg) {
  if (pkg.packageManager) {
    const pm = pkg.packageManager.split("@")[0];
    if (pm) return Promise.resolve(pm);
  }
  return (async () => {
    if (await fileExists(join(projectPath, "bun.lockb")) || await fileExists(join(projectPath, "bun.lock"))) return "bun";
    if (await fileExists(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
    if (await fileExists(join(projectPath, "yarn.lock"))) return "yarn";
    return "npm";
  })();
}
async function detectStack(projectPath) {
  try {
    const raw = await readFile(join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    const language = pkg.devDependencies?.["typescript"] || pkg.dependencies?.["typescript"] ? "TypeScript" : "JavaScript";
    let framework;
    for (const detect of Object.values(FRAMEWORK_DETECTORS)) {
      const result = detect(pkg);
      if (result) {
        framework = result;
        break;
      }
    }
    let styling;
    for (const [name, detect] of Object.entries(STYLING_DETECTORS)) {
      if (detect(pkg)) {
        styling = name;
        break;
      }
    }
    let orm;
    for (const [name, detect] of Object.entries(ORM_DETECTORS)) {
      if (detect(pkg)) {
        orm = name;
        break;
      }
    }
    let testRunner;
    for (const [name, detect] of Object.entries(TEST_DETECTORS)) {
      if (detect(pkg)) {
        testRunner = name;
        break;
      }
    }
    const packageManager = await detectPackageManager(projectPath, pkg);
    const runtime = pkg.engines?.["node"] ? `Node ${pkg.engines["node"]}` : pkg.engines?.["bun"] ? `Bun ${pkg.engines["bun"]}` : void 0;
    return { language, framework, styling, orm, packageManager, runtime, testRunner };
  } catch {
  }
  if (await fileExists(join(projectPath, "go.mod"))) {
    return { language: "Go", packageManager: "go mod" };
  }
  if (await fileExists(join(projectPath, "Cargo.toml"))) {
    return { language: "Rust", packageManager: "cargo" };
  }
  if (await fileExists(join(projectPath, "requirements.txt")) || await fileExists(join(projectPath, "pyproject.toml"))) {
    const hasPyproject = await fileExists(join(projectPath, "pyproject.toml"));
    return { language: "Python", packageManager: hasPyproject ? "pip/poetry" : "pip" };
  }
  return null;
}

// src/analyzer/conventions.ts
import { readFile as readFile2, readdir, stat } from "fs/promises";
import { join as join2, extname, basename } from "path";
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb"
]);
async function sampleFiles(projectPath, max = 15) {
  const files = [];
  const srcDir = join2(projectPath, "src");
  async function walk(dir, depth = 0) {
    if (depth > 4 || files.length >= max) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= max) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
        const fullPath = join2(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch {
    }
  }
  try {
    await stat(srcDir);
    await walk(srcDir);
  } catch {
    await walk(projectPath);
  }
  return files;
}
function detectNamingConvention(names) {
  let camel = 0, snake = 0, pascal = 0;
  for (const name of names) {
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) camel++;
    else if (/^[a-z][a-z0-9_]*$/.test(name)) snake++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) pascal++;
  }
  const total = camel + snake + pascal;
  if (total === 0) return "mixed";
  if (camel / total > 0.6) return "camelCase";
  if (snake / total > 0.6) return "snake_case";
  if (pascal / total > 0.6) return "PascalCase";
  return "mixed";
}
function detectFileNaming(fileNames) {
  let kebab = 0, camel = 0, pascal = 0, snake = 0;
  for (const name of fileNames) {
    const base = name.replace(/\.[^.]+$/, "");
    if (/^[a-z][a-z0-9-]*$/.test(base)) kebab++;
    else if (/^[a-z][a-zA-Z0-9]*$/.test(base)) camel++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(base)) pascal++;
    else if (/^[a-z][a-z0-9_]*$/.test(base)) snake++;
  }
  const total = kebab + camel + pascal + snake;
  if (total === 0) return "mixed";
  if (kebab / total > 0.5) return "kebab-case";
  if (camel / total > 0.5) return "camelCase";
  if (pascal / total > 0.5) return "PascalCase";
  if (snake / total > 0.5) return "snake_case";
  return "mixed";
}
async function detectConventions(projectPath) {
  const files = await sampleFiles(projectPath);
  if (files.length === 0) return null;
  const fileNames = files.map((f) => basename(f));
  const variableNames = [];
  let funcCount = 0, classCount = 0;
  let namedExports = 0, defaultExports = 0;
  let semiCount = 0, noSemiCount = 0;
  let singleQuotes = 0, doubleQuotes = 0;
  let tabLines = 0, spaceLines = 0;
  let indentSizes = [];
  let hasTests = false;
  let testLocation = "colocated";
  for (const filePath of files) {
    try {
      const content = await readFile2(filePath, "utf-8");
      const lines = content.split("\n").slice(0, 100);
      for (const line of lines) {
        if (line.startsWith("	")) tabLines++;
        else if (line.startsWith("  ")) {
          spaceLines++;
          const match = line.match(/^( +)/);
          if (match) indentSizes.push(match[1].length);
        }
        const trimmed = line.trim();
        if (trimmed.length > 5) {
          if (trimmed.endsWith(";")) semiCount++;
          else if (/[a-zA-Z0-9'"`)\]]$/.test(trimmed)) noSemiCount++;
        }
        const singleMatch = line.match(/'/g);
        const doubleMatch = line.match(/"/g);
        if (singleMatch) singleQuotes += singleMatch.length;
        if (doubleMatch) doubleQuotes += doubleMatch.length;
        const varMatch = trimmed.match(/^(?:const|let|var|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (varMatch) variableNames.push(varMatch[1]);
        if (trimmed.startsWith("export default")) defaultExports++;
        else if (trimmed.startsWith("export ")) namedExports++;
        if (/^(?:export\s+)?(?:default\s+)?function\s+[A-Z]/.test(trimmed)) funcCount++;
        if (/^(?:export\s+)?class\s+[A-Z]/.test(trimmed)) classCount++;
      }
      if (filePath.includes("__tests__")) {
        hasTests = true;
        testLocation = "__tests__";
      } else if (filePath.includes(".test.") || filePath.includes(".spec.")) {
        hasTests = true;
      }
    } catch {
    }
  }
  try {
    await stat(join2(projectPath, "test"));
    testLocation = "test_dir";
  } catch {
    try {
      await stat(join2(projectPath, "tests"));
      testLocation = "test_dir";
    } catch {
    }
  }
  const componentPattern = classCount > funcCount ? "class" : funcCount > 0 ? "functional" : void 0;
  const exportStyle = defaultExports > namedExports * 2 ? "default" : namedExports > defaultExports * 2 ? "named" : "mixed";
  let indentSize;
  if (indentSizes.length > 0) {
    const counts = /* @__PURE__ */ new Map();
    for (const s of indentSizes) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    indentSize = sorted[0]?.[0] ?? 2;
    if (indentSize > 4) indentSize = 2;
  }
  return {
    namingConvention: detectNamingConvention(variableNames),
    fileNaming: detectFileNaming(fileNames),
    componentPattern,
    exportStyle,
    testLocation: hasTests ? testLocation : "colocated",
    indentation: tabLines > spaceLines ? "tabs" : "spaces",
    indentSize,
    semicolons: semiCount > noSemiCount,
    quotes: singleQuotes > doubleQuotes ? "single" : "double"
  };
}

// src/analyzer/structure.ts
import { readdir as readdir2 } from "fs/promises";
import { join as join3, relative } from "path";
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "out",
  ".cache",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".turbo"
]);
var KEY_DIR_PATTERNS = {
  "src/components": "UI components",
  "src/hooks": "Custom hooks",
  "src/utils": "Utility functions",
  "src/lib": "Library/shared code",
  "src/api": "API layer",
  "src/routes": "Route definitions",
  "src/app": "App router (Next.js/Remix)",
  "src/pages": "Page components",
  "src/services": "Service layer",
  "src/stores": "State management",
  "src/store": "State management",
  "src/types": "Type definitions",
  "src/styles": "Stylesheets",
  "src/assets": "Static assets",
  "src/middleware": "Middleware",
  "src/config": "Configuration",
  "src/db": "Database layer",
  "src/models": "Data models",
  "src/schemas": "Validation schemas",
  "src/tests": "Tests",
  "src/__tests__": "Tests",
  "app": "App router",
  "pages": "Pages",
  "components": "UI components",
  "lib": "Library code",
  "utils": "Utility functions",
  "hooks": "Custom hooks",
  "api": "API layer",
  "public": "Static files",
  "prisma": "Prisma schema/migrations",
  "migrations": "Database migrations",
  "scripts": "Build/utility scripts",
  "test": "Tests",
  "tests": "Tests",
  "__tests__": "Tests",
  "e2e": "End-to-end tests"
};
async function detectStructure(projectPath, maxDepth = 3) {
  const rootDirs = [];
  const keyDirs = {};
  let totalFiles = 0;
  const treeLines = [];
  async function walk(dir, depth, prefix) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir2(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."));
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith("."));
    totalFiles += files.length;
    if (depth === 0) {
      for (const d of dirs) rootDirs.push(d.name);
    }
    const items = [...dirs, ...files.slice(0, 5)];
    const hasMoreFiles = files.length > 5;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const isLast = i === items.length - 1 && !hasMoreFiles;
      const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      const childPrefix = isLast ? "    " : "\u2502   ";
      if (entry.isDirectory()) {
        treeLines.push(`${prefix}${connector}${entry.name}/`);
        const relPath = relative(projectPath, join3(dir, entry.name)).replace(/\\/g, "/");
        if (KEY_DIR_PATTERNS[relPath]) {
          keyDirs[relPath] = KEY_DIR_PATTERNS[relPath];
        }
        await walk(join3(dir, entry.name), depth + 1, `${prefix}${childPrefix}`);
      } else {
        treeLines.push(`${prefix}${connector}${entry.name}`);
      }
    }
    if (hasMoreFiles) {
      treeLines.push(`${prefix}\u2514\u2500\u2500 ... ${files.length - 5} more files`);
    }
  }
  await walk(projectPath, 0, "");
  return {
    rootDirs,
    keyDirs,
    totalFiles,
    tree: treeLines.join("\n")
  };
}

// src/analyzer/dependencies.ts
import { readFile as readFile3 } from "fs/promises";
import { join as join4 } from "path";
var CATEGORIES = {
  "UI Framework": ["react", "vue", "svelte", "@angular/core", "solid-js", "preact"],
  "Meta Framework": ["next", "nuxt", "@remix-run/react", "astro", "@sveltejs/kit", "gatsby"],
  "Styling": ["tailwindcss", "styled-components", "@emotion/react", "sass", "less", "@mantine/core", "@chakra-ui/react", "antd", "@radix-ui/react-*"],
  "State": ["zustand", "jotai", "recoil", "@reduxjs/toolkit", "redux", "mobx", "valtio", "pinia", "vuex"],
  "HTTP": ["axios", "ky", "got", "node-fetch", "undici", "@tanstack/react-query", "swr"],
  "Database": ["@prisma/client", "drizzle-orm", "typeorm", "sequelize", "mongoose", "knex", "pg", "mysql2", "better-sqlite3", "redis", "ioredis"],
  "ORM/Schema": ["prisma", "drizzle-kit", "zod", "yup", "joi", "ajv", "valibot", "superstruct"],
  "Auth": ["next-auth", "@auth/core", "passport", "jsonwebtoken", "bcrypt", "lucia"],
  "Server": ["express", "fastify", "hono", "koa", "@nestjs/core", "h3"],
  "Testing": ["vitest", "jest", "@playwright/test", "cypress", "mocha", "chai", "@testing-library/react", "supertest"],
  "Build": ["tsup", "esbuild", "rollup", "vite", "webpack", "turbo", "nx"],
  "Linting": ["eslint", "prettier", "biome", "@biomejs/biome", "oxlint"]
};
function categorize(pkgName) {
  for (const [category, packages] of Object.entries(CATEGORIES)) {
    for (const pattern of packages) {
      if (pattern.endsWith("*")) {
        if (pkgName.startsWith(pattern.slice(0, -1))) return category;
      } else if (pkgName === pattern) {
        return category;
      }
    }
  }
  return "Other";
}
async function detectDependencies(projectPath) {
  try {
    const raw = await readFile3(join4(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    const production = Object.entries(pkg.dependencies ?? {}).map(
      ([name, version]) => ({
        name,
        version,
        category: categorize(name)
      })
    );
    const development = Object.entries(pkg.devDependencies ?? {}).map(
      ([name, version]) => ({
        name,
        version,
        category: categorize(name)
      })
    );
    const categories = {};
    for (const dep of [...production, ...development]) {
      if (dep.category === "Other") continue;
      if (!categories[dep.category]) categories[dep.category] = [];
      categories[dep.category].push(dep.name);
    }
    return { production, development, categories };
  } catch {
    return null;
  }
}

// src/analyzer/index.ts
async function analyzeCodebase(projectPath, depth = 3) {
  const [stack, conventions, structure, dependencies] = await Promise.all([
    detectStack(projectPath),
    detectConventions(projectPath),
    detectStructure(projectPath, depth),
    detectDependencies(projectPath)
  ]);
  const context = {};
  if (stack) context.stack = stack;
  if (conventions) context.conventions = conventions;
  if (structure) context.structure = structure;
  if (dependencies) context.dependencies = dependencies;
  return context;
}

// src/mcp/tools.ts
import { refinePrompt, getRulesDescription } from "@promptly/rules";
function registerTools(server) {
  server.tool(
    "analyze_codebase",
    `Analyzes the project at the given path and returns structured context about the tech stack, code conventions, file structure, and dependencies. Call this before refining a prompt to understand what you're working with.`,
    {
      project_path: z.string().describe("Absolute path to the project root directory"),
      depth: z.number().optional().default(3).describe("How deep to scan the file tree (default 3)")
    },
    async ({ project_path, depth }) => {
      try {
        const context = await analyzeCodebase(project_path, depth);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(context, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing codebase: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "refine_prompt",
    `Refines a coding prompt using Promptly's rules and optional codebase context.

    WHEN TO CALL: Any prompt asking to write, fix, refactor, or explain code. Any prompt involving files, components, functions, APIs, or databases.
    DO NOT CALL: For general questions, math, writing, or casual chat.

    For best results, call analyze_codebase first and pass the result as codebase_context.
    Returns the refined prompt that you should execute instead of the original.`,
    {
      raw_prompt: z.string().describe("The original unmodified prompt from the user"),
      codebase_context: z.string().optional().describe("JSON string from analyze_codebase output"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("claude_code").describe("Which agent is being used")
    },
    async ({ raw_prompt, codebase_context, agent }) => {
      let context = {};
      if (codebase_context) {
        try {
          context = JSON.parse(codebase_context);
        } catch {
        }
      }
      const { refined, rulesApplied } = refinePrompt(raw_prompt, context, agent);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              refined_prompt: refined,
              rules_applied: rulesApplied,
              original_prompt: raw_prompt
            }, null, 2)
          }
        ]
      };
    }
  );
  server.tool(
    "get_refinement_rules",
    `Returns the current Promptly refinement rules for the specified agent. Call this if the user asks how Promptly works or if you need a refresher on the rules.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "generic"]).optional().default("generic").describe("Which agent to get rules for")
    },
    async ({ agent }) => {
      const description = getRulesDescription(agent);
      return {
        content: [
          {
            type: "text",
            text: description
          }
        ]
      };
    }
  );
}

// src/mcp/server.ts
function createServer() {
  const server = new McpServer({
    name: "Promptly",
    version: "1.0.0"
  });
  registerTools(server);
  return server;
}
async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
export {
  createServer,
  startStdioServer
};
