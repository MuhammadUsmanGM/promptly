import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { StructureInfo } from "../rules/index.js";
import { loadGitignore } from "./gitignore.js";

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

// Token guardrails. On a big monorepo (10k+ files) the old 500-file list plus
// a full tree string blew up context unnecessarily since findRelevantFiles
// only ever surfaces 8 files to the agent. These caps keep the cached analysis
// small without hurting relevance scoring.
//
// MAX_FILES is enough room for findRelevantFiles to do keyword matching across
// a representative slice of the repo — files are prioritized so shallow /
// keyDir paths are picked first, which is where almost all matches land.
// TREE_FILE_THRESHOLD: if totalFiles exceeds this, drop the tree entirely.
// The rewriter doesn't read tree today; this mainly shrinks the serialized
// context on disk and in memory.
const MAX_FILES = 200;
const TREE_FILE_THRESHOLD = 300;

interface FileEntry {
  relPath: string;
  depth: number;
  inKeyDir: boolean;
}

export async function detectStructure(
  projectPath: string,
  maxDepth = 3,
): Promise<StructureInfo> {
  const rootDirs: string[] = [];
  const keyDirs: Record<string, string> = {};
  let totalFiles = 0;
  const treeLines: string[] = [];
  const allFiles: FileEntry[] = [];

  // Pre-compute which of KEY_DIR_PATTERNS are top-level (single segment) so we
  // can cheaply flag files as "lives inside a known key dir" during the walk.
  const keyDirPaths = Object.keys(KEY_DIR_PATTERNS);
  const isInKeyDir = (relDir: string): boolean =>
    keyDirPaths.some((k) => relDir === k || relDir.startsWith(k + "/"));

  // .gitignore is additive to SKIP_DIRS — it catches repo-specific generated
  // files (dist/, *.generated.ts, coverage/) that pollute the sampled slice
  // and skew conventions. SKIP_DIRS stays as a backstop for repos with no
  // .gitignore (node_modules etc. are always skipped regardless).
  const ignore = await loadGitignore(projectPath);

  async function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const relDir = relative(projectPath, dir).replace(/\\/g, "/");

    const subDirs = entries.filter((e) => {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith(".")) return false;
      const relSub = relDir === "" ? e.name : `${relDir}/${e.name}`;
      return !ignore.isIgnoredDir(relSub);
    });
    const dirFiles = entries.filter((e) => {
      if (!e.isFile() || e.name.startsWith(".")) return false;
      const relFile = relDir === "" ? e.name : `${relDir}/${e.name}`;
      return !ignore.isIgnored(relFile);
    });

    totalFiles += dirFiles.length;

    // Collect every file we see — we'll sort + cap at the end so the cap
    // rejects less-relevant entries, not whichever ones happened to come last.
    const inKey = relDir === "" ? false : isInKeyDir(relDir);
    for (const f of dirFiles) {
      const relPath = relDir === "" ? f.name : `${relDir}/${f.name}`;
      allFiles.push({ relPath, depth, inKeyDir: inKey });
    }

    if (depth === 0) {
      for (const d of subDirs) rootDirs.push(d.name);
    }

    const items = [...subDirs, ...dirFiles.slice(0, 5)]; // show max 5 files per dir
    const hasMoreFiles = dirFiles.length > 5;

    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const isLast = i === items.length - 1 && !hasMoreFiles;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      if (entry.isDirectory()) {
        treeLines.push(`${prefix}${connector}${entry.name}/`);

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
      treeLines.push(`${prefix}└── ... ${dirFiles.length - 5} more files`);
    }
  }

  await walk(projectPath, 0, "");

  // Rank files: keyDir files first, then by shallowness, then alphabetically
  // for stable output. This ensures the MAX_FILES cut keeps the slice most
  // useful to findRelevantFiles (which prioritizes files in keyword-matching
  // directories anyway).
  allFiles.sort((a, b) => {
    if (a.inKeyDir !== b.inKeyDir) return a.inKeyDir ? -1 : 1;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.relPath.localeCompare(b.relPath);
  });

  const truncated = allFiles.length > MAX_FILES;
  const files = (truncated ? allFiles.slice(0, MAX_FILES) : allFiles).map((f) => f.relPath);

  // Token guardrail: gate the tree string behind a total-file threshold. On a
  // small/medium repo the tree is genuinely useful; on a big one it's a wall
  // of text that doesn't change the refinement quality. keyDirs + files still
  // give the agent everything it needs for relevance scoring.
  const tree = totalFiles > TREE_FILE_THRESHOLD ? "" : treeLines.join("\n");

  return {
    rootDirs,
    keyDirs,
    totalFiles,
    tree,
    files,
    ...(truncated ? { truncated: true } : {}),
  };
}
