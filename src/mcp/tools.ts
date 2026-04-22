import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { watch, type FSWatcher } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
import { analyzeCodebase } from "../analyzer/index.js";
import { refinePrompt, getRulesDescription, type Agent, type CodebaseContext } from "../rules/index.js";
import { loadPersistedContext, persistContext } from "./persistentCache.js";

// Cache analysis per analysis root — invalidated by file watchers or 30min TTL.
// Key is the resolved analysis root (not projectPath) so sibling packages in a monorepo
// don't share each other's results.
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (conventions rarely change)
const WATCHED_FILES = ["package.json", "tsconfig.json"];

interface CacheEntry {
  context: CodebaseContext;
  timestamp: number;
  watchers: FSWatcher[];
}

const analysisCache = new Map<string, CacheEntry>();

function invalidateCache(cacheKey: string) {
  const entry = analysisCache.get(cacheKey);
  if (entry) {
    for (const w of entry.watchers) w.close();
    analysisCache.delete(cacheKey);
  }
}

function watchProjectFiles(projectPath: string, cacheKey: string): FSWatcher[] {
  const watchers: FSWatcher[] = [];
  for (const file of WATCHED_FILES) {
    try {
      const w = watch(join(projectPath, file), () => {
        invalidateCache(cacheKey);
      });
      w.on("error", () => {}); // file may not exist — ignore
      watchers.push(w);
    } catch {
      // file doesn't exist — skip
    }
  }
  return watchers;
}

function getCachedAnalysis(cacheKey: string): CodebaseContext | null {
  const entry = analysisCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    invalidateCache(cacheKey);
    return null;
  }
  return entry.context;
}

function setCachedAnalysis(cacheKey: string, projectPath: string, context: CodebaseContext) {
  invalidateCache(cacheKey); // clean up any old watchers
  const watchers = watchProjectFiles(projectPath, cacheKey);
  analysisCache.set(cacheKey, { context, timestamp: Date.now(), watchers });
}

// Small per-call cache for recent git files — same MCP server handles many calls,
// and shelling out to git is cheap but not free. 60s TTL is well inside "fresh
// enough to be useful" and well outside "costs noticeable latency per call".
const GIT_RECENT_TTL_MS = 60 * 1000;
const gitRecentCache = new Map<string, { files: string[]; timestamp: number }>();

async function getRecentlyChangedFiles(projectPath: string): Promise<string[]> {
  const cached = gitRecentCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < GIT_RECENT_TTL_MS) {
    return cached.files;
  }
  try {
    // -20 recent commits, name-only output, no pager. Fast even on big repos.
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-20", "--name-only", "--pretty=format:", "--no-renames"],
      { cwd: projectPath, timeout: 3000, maxBuffer: 1024 * 1024 },
    );
    const files = [...new Set(
      stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    )];
    gitRecentCache.set(projectPath, { files, timestamp: Date.now() });
    return files;
  } catch {
    // Not a git repo, no git on PATH, timeout — all fine. Just means no signal.
    gitRecentCache.set(projectPath, { files: [], timestamp: Date.now() });
    return [];
  }
}

// Pull file-path-looking tokens out of the raw prompt ("fix src/foo.ts", "update apps/web/...")
// so we can route monorepo analysis to the right sub-package even when the caller didn't
// pass explicit target_files.
function extractPathHints(prompt: string): string[] {
  const hints: string[] = [];
  // Match tokens with a slash and either an extension or a known source dir prefix.
  // We're deliberately conservative — false positives here send the analyzer to the wrong
  // package, which is worse than no hint at all.
  const pathRegex = /(?:^|\s|["'`(])((?:apps|packages|services|src|lib|app|components|pages|api)\/[\w./\-]+)/gi;
  for (const match of prompt.matchAll(pathRegex)) {
    hints.push(match[1]);
  }
  const extRegex = /(?:^|\s|["'`(])([\w.\-/]+\.(?:ts|tsx|js|jsx|vue|svelte|py|go|rs|json|md|yaml|yml|css))\b/gi;
  for (const match of prompt.matchAll(extRegex)) {
    hints.push(match[1]);
  }
  return [...new Set(hints)];
}

export function registerTools(server: McpServer, debug = false) {
  const log = debug
    ? (...args: unknown[]) => console.error("[promptly]", ...args)
    : () => {};

  server.tool(
    "refine_prompt",
    `Analyzes the codebase and rewrites a coding prompt with project context baked in. Detects intent (create/fix/refactor/explain/configure/test) and tailors the rewrite accordingly.

WHEN TO CALL: Any prompt to write, fix, refactor, explain, or configure code.
SKIP FOR: General chat, math, non-coding questions.

In monorepos, pass target_files (paths the user mentioned or files the prompt is about) so Promptly narrows analysis to the right sub-package. Pass context_files for files you have open but weren't explicitly named — they give relevance scoring a real anchor.

Returns a rewritten prompt. Execute it instead of the original.`,
    {
      raw_prompt: z.string().describe("The user's original prompt"),
      project_path: z.string().describe("Absolute path to the project root"),
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "qwen_code", "generic"]).optional().default("claude_code"),
      target_files: z.array(z.string()).optional().describe(
        "File paths the prompt is explicitly about (paths named in the prompt, files the task targets). Used to pick the right sub-package in a monorepo and as the strongest signal in relevance scoring.",
      ),
      context_files: z.array(z.string()).optional().describe(
        "File paths the agent currently has open or is already looking at, but that aren't explicit targets. Weaker signal than target_files — used to boost relevance scoring without narrowing monorepo analysis.",
      ),
    },
    async ({ raw_prompt, project_path, agent, target_files, context_files }) => {
      log(`refine_prompt called — path=${project_path}, agent=${agent}`);
      try {
        // Combine explicit target_files with hints extracted from the prompt text.
        // Explicit wins (listed first) — prompt extraction is best-effort.
        const hints = [...(target_files ?? []), ...extractPathHints(raw_prompt)];

        // We need to know the analysis root before we can cache-key correctly.
        // Cheapest path: do the full analysis, then key by its resolved root.
        // This does mean a second call with different hints may re-analyze a different
        // sub-package — that's correct behavior, not a bug.
        let context: CodebaseContext | null = null;

        // Fast path: if there are no hints, we can use projectPath as the cache key
        // (resolveAnalysisRoot would stay at the root anyway). We bake the agent into
        // the key so different agents don't share cached userRules.
        const fastKey = hints.length === 0 ? `${project_path}::${agent}` : null;
        if (fastKey) {
          context = getCachedAnalysis(fastKey);
          if (context) log("cache hit (no-hints fast path, memory)");
          if (!context) {
            // Fall back to disk — survives MCP restarts. Fingerprinted by
            // package.json + tsconfig.json content/mtime, so stale-on-dep-change.
            context = await loadPersistedContext(project_path, fastKey);
            if (context) {
              log("cache hit (no-hints fast path, disk)");
              // Re-populate memory + watchers so subsequent calls hit the in-memory path.
              setCachedAnalysis(fastKey, project_path, context);
            }
          }
        }

        if (!context) {
          log("cache miss — analyzing codebase");
          context = await analyzeCodebase(project_path, {
            depth: 3,
            hints,
            agent: agent as Agent,
          });
          // Key cache by (analysis root + agent) — different agents look up different
          // instruction files, so their contexts aren't interchangeable.
          const rootKey = context.workspace?.analysisRoot ?? project_path;
          const key = `${rootKey}::${agent}`;
          setCachedAnalysis(key, project_path, context);
          // Persist to disk so the next MCP restart skips the analysis entirely.
          await persistContext(project_path, key, context);
        }

        // Git signals are computed per-call (not cached with analysis) because
        // recent history is exactly the thing that changes between MCP calls —
        // using a stale snapshot would defeat the point.
        const recentFiles = await getRecentlyChangedFiles(project_path);

        const { refined, intent } = refinePrompt(raw_prompt, context, agent as Agent, {
          targetFiles: target_files,
          contextFiles: context_files,
          recentFiles,
        });
        log(`done — intent=${intent}`);

        return {
          content: [{
            type: "text" as const,
            text: `${refined}\n\n---\n[Promptly] intent: ${intent}`,
          }],
        };
      } catch (error) {
        log("error —", error);
        return {
          content: [{
            type: "text" as const,
            text: raw_prompt,
          }],
        };
      }
    },
  );

  server.tool(
    "get_refinement_rules",
    `Returns Promptly's rules. Only call if the user asks how Promptly works.`,
    {
      agent: z.enum(["claude_code", "cursor", "gemini_cli", "qwen_code", "generic"]).optional().default("generic"),
    },
    async ({ agent }) => {
      return {
        content: [{
          type: "text" as const,
          text: getRulesDescription(agent as Agent),
        }],
      };
    },
  );
}
