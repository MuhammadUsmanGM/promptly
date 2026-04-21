import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Agent } from "../rules/index.js";

// Loads user-authored rules from agent instruction files (CLAUDE.md, .cursorrules,
// GEMINI.md, QWEN.md). These are the user's own ground truth — when present, they
// should override anything the analyzer inferred from sampling code.
//
// We check, in order:
//   1. Project-local file at the analysis root
//   2. Project-local file at the repo root (when different from analysis root)
//   3. User's home directory (for globally-configured rules)
//
// The first hit wins. We do NOT merge — users who want layered rules can inline them.

export interface UserRules {
  source: string;            // absolute path to the file we read
  content: string;           // the rules text, truncated to MAX_CHARS
  truncated: boolean;        // whether we cut it off
}

// Conservative cap. These files get inlined into every refined prompt; a 10k-line
// CLAUDE.md would dominate the context. If the user's rules are genuinely larger
// than this, they should split them.
const MAX_CHARS = 4000;

// Per-agent file precedence. Each entry is tried at each search root in order.
const AGENT_FILES: Record<Agent, string[]> = {
  claude_code: ["CLAUDE.md", ".claude/CLAUDE.md"],
  cursor: [".cursorrules", ".cursor/rules.md"],
  gemini_cli: ["GEMINI.md", ".gemini/GEMINI.md"],
  qwen_code: ["QWEN.md", ".qwen/QWEN.md"],
  generic: ["CLAUDE.md", ".cursorrules", "GEMINI.md", "QWEN.md"],
};

async function tryRead(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf-8");
    // Skip empty or whitespace-only files — they're not useful context and would
    // produce a confusing "user rules present but empty" signal in the rewrite.
    if (content.trim().length === 0) return null;
    return content;
  } catch {
    return null;
  }
}

export async function loadUserRules(
  analysisRoot: string,
  repoRoot: string,
  agent: Agent,
): Promise<UserRules | null> {
  const filenames = AGENT_FILES[agent] ?? AGENT_FILES.generic;
  const searchRoots: string[] = [analysisRoot];
  if (repoRoot !== analysisRoot) searchRoots.push(repoRoot);
  // Home dir holds global Claude Code / Gemini / Qwen configs
  searchRoots.push(homedir());

  for (const root of searchRoots) {
    for (const filename of filenames) {
      const path = join(root, filename);
      const content = await tryRead(path);
      if (content === null) continue;
      return {
        source: path,
        content: content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) : content,
        truncated: content.length > MAX_CHARS,
      };
    }
  }

  return null;
}
