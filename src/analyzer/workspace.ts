import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Workspace detection for monorepos.
// Supports npm/yarn workspaces (`workspaces` in root package.json),
// pnpm workspaces (pnpm-workspace.yaml), and Turborepo (turbo.json).
//
// Exposes two things the rest of the analyzer needs:
//   - detectWorkspace(root): the workspace layout (is it a monorepo? what are the package dirs?)
//   - resolveAnalysisRoot(root, hints): given a repo root and optional target files,
//     pick the sub-package the user is most likely asking about.

export interface WorkspaceInfo {
  isMonorepo: boolean;
  root: string;              // the repo root (where the workspace declaration lives)
  tool: "npm" | "yarn" | "pnpm" | "turbo" | "none";
  packages: string[];        // absolute paths to each sub-package that has a package.json
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T = unknown>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Minimal YAML reader for pnpm-workspace.yaml. We only need the `packages:` list,
// so a full YAML parser would be overkill (and adds a dep).
async function readPnpmWorkspacePackages(yamlPath: string): Promise<string[]> {
  try {
    const raw = await readFile(yamlPath, "utf-8");
    const patterns: string[] = [];
    let inPackages = false;
    for (const line of raw.split(/\r?\n/)) {
      if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
      if (inPackages) {
        // Stop at the next top-level key
        if (/^\S/.test(line) && !/^\s*-/.test(line)) break;
        const match = line.match(/^\s*-\s*["']?([^"'\s#]+)["']?/);
        if (match) patterns.push(match[1]);
      }
    }
    return patterns;
  } catch {
    return [];
  }
}

// Expand a single glob pattern like "packages/*" or "apps/**" into concrete directories
// that contain a package.json. We keep this intentionally minimal — only the two shapes
// that cover ~all real-world workspace configs.
async function expandGlob(root: string, pattern: string): Promise<string[]> {
  // Normalize: strip leading ./, trailing /
  const normalized = pattern.replace(/^\.\//, "").replace(/\/+$/, "");

  // Reject negation and absolute patterns — not something we need to support
  if (normalized.startsWith("!") || isAbsolute(normalized)) return [];

  const segments = normalized.split("/");
  const results: string[] = [];

  async function walk(current: string, index: number) {
    if (index >= segments.length) {
      if (await fileExists(join(current, "package.json"))) results.push(current);
      return;
    }
    const segment = segments[index];
    if (segment === "*" || segment === "**") {
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const child = join(current, entry.name);
        if (segment === "**") {
          // `**` matches zero or more path segments — recurse at the same index AND advance
          await walk(child, index);
          await walk(child, index + 1);
        } else {
          await walk(child, index + 1);
        }
      }
    } else {
      await walk(join(current, segment), index + 1);
    }
  }

  await walk(root, 0);
  return results;
}

async function expandPatterns(root: string, patterns: string[]): Promise<string[]> {
  const all = await Promise.all(patterns.map((p) => expandGlob(root, p)));
  // Deduplicate — overlapping patterns ("apps/*" and "apps/web") would otherwise double-count
  return [...new Set(all.flat())];
}

export async function detectWorkspace(root: string): Promise<WorkspaceInfo> {
  const fallback: WorkspaceInfo = { isMonorepo: false, root, tool: "none", packages: [] };

  // pnpm takes precedence — if pnpm-workspace.yaml exists, that's the source of truth
  const pnpmYaml = join(root, "pnpm-workspace.yaml");
  if (await fileExists(pnpmYaml)) {
    const patterns = await readPnpmWorkspacePackages(pnpmYaml);
    const packages = await expandPatterns(root, patterns);
    return { isMonorepo: packages.length > 0, root, tool: "pnpm", packages };
  }

  // npm / yarn workspaces live in the root package.json
  const rootPkg = await readJsonSafe<{ workspaces?: string[] | { packages?: string[] } }>(
    join(root, "package.json"),
  );
  if (rootPkg?.workspaces) {
    const patterns = Array.isArray(rootPkg.workspaces)
      ? rootPkg.workspaces
      : rootPkg.workspaces.packages ?? [];
    const packages = await expandPatterns(root, patterns);
    // Yarn vs npm — look for a yarn.lock to pick the right tool name
    const tool: WorkspaceInfo["tool"] = (await fileExists(join(root, "yarn.lock"))) ? "yarn" : "npm";
    return { isMonorepo: packages.length > 0, root, tool, packages };
  }

  // Turborepo can wrap any of the above, but may also appear without explicit workspaces
  // (rare, but `turbo.json` alone signals monorepo intent). We only report `turbo` if no
  // other workspace tool matched — otherwise the tool name reflects the package manager.
  if (await fileExists(join(root, "turbo.json"))) {
    // Try to find packages by scanning common top-level dirs
    const candidates = ["apps", "packages", "services"];
    const packages: string[] = [];
    for (const dir of candidates) {
      const discovered = await expandGlob(root, `${dir}/*`);
      packages.push(...discovered);
    }
    return { isMonorepo: packages.length > 0, root, tool: "turbo", packages: [...new Set(packages)] };
  }

  return fallback;
}

// Given a set of hint paths (files the user mentioned, or files the agent is looking at),
// find the workspace package that best matches. Strategy: for each hint, walk up until we
// hit a directory that's a known package root. Pick the package with the most hits.
//
// Returns null if no hint maps to a package — callers should fall back to the workspace root.
function pickPackageFromHints(workspace: WorkspaceInfo, hints: string[]): string | null {
  if (!workspace.isMonorepo || hints.length === 0) return null;

  const packageSet = new Set(workspace.packages.map((p) => resolve(p)));
  const scores = new Map<string, number>();

  for (const hint of hints) {
    const absHint = isAbsolute(hint) ? hint : resolve(workspace.root, hint);
    // Walk up from the hint, looking for the deepest package root that contains it
    let best: string | null = null;
    let current = absHint;
    // Guard against symlink loops / bad inputs — 40 levels is way more than any real tree
    for (let i = 0; i < 40; i++) {
      const parent = dirname(current);
      if (parent === current) break;
      if (packageSet.has(current)) { best = current; break; }
      // Also check if `current` itself is listed (the hint might already be a package dir)
      if (packageSet.has(parent)) { best = parent; break; }
      current = parent;
    }
    if (best) scores.set(best, (scores.get(best) ?? 0) + 1);
  }

  if (scores.size === 0) return null;
  // Highest score wins; ties broken by deepest path (most specific)
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

export interface ResolvedRoot {
  analysisRoot: string;      // where to run stack/convention/structure detection
  workspace: WorkspaceInfo;  // full workspace info (for reporting)
  isSubPackage: boolean;     // true if we narrowed into a monorepo sub-package
}

export async function resolveAnalysisRoot(
  projectPath: string,
  hints: string[] = [],
): Promise<ResolvedRoot> {
  const workspace = await detectWorkspace(projectPath);

  if (!workspace.isMonorepo) {
    return { analysisRoot: projectPath, workspace, isSubPackage: false };
  }

  const picked = pickPackageFromHints(workspace, hints);
  if (picked) {
    return { analysisRoot: picked, workspace, isSubPackage: true };
  }

  // No hint matched — stay at the root. Callers may still want to know it's a monorepo
  // so they can warn the user that results are aggregated across packages.
  return { analysisRoot: projectPath, workspace, isSubPackage: false };
}

// Helper: given an analysis root, produce a human-readable label for reporting
// ("web" for "/repo/apps/web", "." for the repo root).
export function labelForRoot(root: string, workspace: WorkspaceInfo): string {
  if (root === workspace.root) return ".";
  const rel = relative(workspace.root, root).split(sep).join("/");
  return rel || ".";
}
