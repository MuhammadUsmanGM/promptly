import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { StructureInfo } from "../rules/index.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit",
  "dist", "build", "out", ".cache", "coverage", "__pycache__",
  ".venv", "venv", "target", ".turbo",
]);

const KEY_DIR_PATTERNS: Record<string, string> = {
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
  "e2e": "End-to-end tests",
};

export async function detectStructure(
  projectPath: string,
  maxDepth = 3,
): Promise<StructureInfo> {
  const rootDirs: string[] = [];
  const keyDirs: Record<string, string> = {};
  let totalFiles = 0;
  const treeLines: string[] = [];

  async function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: dirs first, then files
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."));
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith("."));

    totalFiles += files.length;

    if (depth === 0) {
      for (const d of dirs) rootDirs.push(d.name);
    }

    const items = [...dirs, ...files.slice(0, 5)]; // show max 5 files per dir
    const hasMoreFiles = files.length > 5;

    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const isLast = i === items.length - 1 && !hasMoreFiles;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      if (entry.isDirectory()) {
        treeLines.push(`${prefix}${connector}${entry.name}/`);

        // Check if it's a key dir
        const relPath = relative(projectPath, join(dir, entry.name)).replace(/\\/g, "/");
        if (KEY_DIR_PATTERNS[relPath]) {
          keyDirs[relPath] = KEY_DIR_PATTERNS[relPath];
        }

        await walk(join(dir, entry.name), depth + 1, `${prefix}${childPrefix}`);
      } else {
        treeLines.push(`${prefix}${connector}${entry.name}`);
      }
    }

    if (hasMoreFiles) {
      treeLines.push(`${prefix}└── ... ${files.length - 5} more files`);
    }
  }

  await walk(projectPath, 0, "");

  return {
    rootDirs,
    keyDirs,
    totalFiles,
    tree: treeLines.join("\n"),
  };
}
