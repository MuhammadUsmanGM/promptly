import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CodebaseContext } from "../rules/index.js";

// Disk cache lives under <projectPath>/.promptly/cache.json. The MCP server's
// in-memory Map dies on every agent restart; this file lets us survive those
// restarts and effectively make the cache permanent-until-deps-change.
//
// Cache key fingerprint = sha1 of (contents of package.json + tsconfig.json +
// their mtimes). If either file is edited OR deleted, the fingerprint shifts
// and the entry is treated as stale.

const CACHE_DIR = ".promptly";
const CACHE_FILE = "cache.json";
const FINGERPRINT_FILES = ["package.json", "tsconfig.json"];
const CACHE_SCHEMA_VERSION = 1;

export interface PersistedEntry {
  fingerprint: string;
  context: CodebaseContext;
  timestamp: number;
}

interface PersistedFile {
  version: number;
  entries: Record<string, PersistedEntry>;
}

function cachePath(projectPath: string): string {
  return join(projectPath, CACHE_DIR, CACHE_FILE);
}

export async function computeFingerprint(projectPath: string): Promise<string> {
  const hash = createHash("sha1");
  for (const file of FINGERPRINT_FILES) {
    const full = join(projectPath, file);
    try {
      const [content, st] = await Promise.all([
        readFile(full, "utf8"),
        stat(full),
      ]);
      hash.update(file);
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
      hash.update(String(st.mtimeMs));
      hash.update("\0");
    } catch {
      // File missing — still mix a sentinel so its absence is part of the hash.
      hash.update(file);
      hash.update("\0MISSING\0");
    }
  }
  return hash.digest("hex");
}

async function readCacheFile(projectPath: string): Promise<PersistedFile | null> {
  try {
    const raw = await readFile(cachePath(projectPath), "utf8");
    const parsed = JSON.parse(raw) as PersistedFile;
    if (parsed.version !== CACHE_SCHEMA_VERSION) return null;
    if (!parsed.entries || typeof parsed.entries !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCacheFile(projectPath: string, data: PersistedFile): Promise<void> {
  const path = cachePath(projectPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), "utf8");
}

export async function loadPersistedContext(
  projectPath: string,
  cacheKey: string,
): Promise<CodebaseContext | null> {
  const file = await readCacheFile(projectPath);
  if (!file) return null;
  const entry = file.entries[cacheKey];
  if (!entry) return null;
  const current = await computeFingerprint(projectPath);
  if (current !== entry.fingerprint) return null;
  return entry.context;
}

export async function persistContext(
  projectPath: string,
  cacheKey: string,
  context: CodebaseContext,
): Promise<void> {
  try {
    const fingerprint = await computeFingerprint(projectPath);
    const existing = (await readCacheFile(projectPath)) ?? {
      version: CACHE_SCHEMA_VERSION,
      entries: {},
    };
    existing.entries[cacheKey] = {
      fingerprint,
      context,
      timestamp: Date.now(),
    };
    await writeCacheFile(projectPath, existing);
  } catch {
    // Disk cache is best-effort — never fail the request because we couldn't
    // write a cache file (read-only fs, permission issues, etc.).
  }
}
