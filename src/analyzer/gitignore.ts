import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Minimal .gitignore matcher. We only look at the top-level .gitignore — nested
// ignore files are skipped for simplicity. The common case that actually hurts
// convention sampling is top-level entries like `dist/`, `*.generated.ts`,
// `build/`, `coverage/`, which this handles.
//
// Returned matcher takes a repo-relative POSIX path and reports:
//   - isIgnored: true if a file at that exact path should be skipped
//   - isIgnoredDir: true if a directory at that path should not be recursed
//
// Not supported (intentional, to keep this small):
//   - Nested .gitignore files (only root is read)
//   - Shared .git/info/exclude, global excludesFile
//   - Character classes, `**` segments beyond the common leading `**/` shorthand
//     (we handle the 3 common uses: leading `**/`, trailing `/**`, bare `**`)
//
// We bias toward "don't over-skip" — a false positive here would hide real source
// files from the analyzer. So when a pattern is ambiguous or malformed, we just
// drop it rather than trying to be clever.

export interface GitignoreMatcher {
  isIgnored(relPath: string): boolean;
  isIgnoredDir(relPath: string): boolean;
}

interface Rule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

function patternToRegex(pattern: string): RegExp | null {
  // Strip leading/trailing whitespace (gitignore allows trailing spaces when
  // escaped, but we're not going to sweat that edge).
  let p = pattern.trim();
  if (!p) return null;

  // Anchored (starts with `/`) means match only at repo root. We normalize by
  // stripping the leading slash — our paths are already repo-relative, no leading
  // slash. After stripping, the pattern must match from position 0.
  let anchored = false;
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  } else if (p.includes("/") && !p.startsWith("**/")) {
    // gitignore rule: patterns containing a `/` (other than a trailing one) are
    // treated as anchored to the gitignore location, which for us is the root.
    // e.g. `src/generated` matches `src/generated` but not `foo/src/generated`.
    // A trailing `/` alone doesn't count (`dir/` is NOT anchored).
    const withoutTrailing = p.endsWith("/") ? p.slice(0, -1) : p;
    if (withoutTrailing.includes("/")) anchored = true;
  }

  // Escape regex metacharacters, then translate glob syntax. Order matters:
  // escape first, then unescape and translate our glob tokens.
  let re = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "*") {
      // `**` handling: `**/` at start or `/**` at end means "any depth". Between
      // two segments (`a/**/b`) also means any depth. Collapse sequences of `*`
      // accordingly.
      if (p[i + 1] === "*") {
        // Look at surrounding context
        const before = i === 0 ? "start" : p[i - 1];
        const after = p[i + 2];
        if (before === "start" && after === "/") {
          // Leading `**/` — match zero or more path segments
          re += "(?:.*/)?";
          i += 3;
          continue;
        }
        if (after === undefined) {
          // Trailing `**` — match everything after this point
          re += ".*";
          i += 2;
          continue;
        }
        if (before === "/" && after === "/") {
          // Middle `/**/` — consumed the trailing slash here, next char will be
          // the char after it. Match one or more segments OR nothing.
          re += "(?:.*/)?";
          i += 3;
          continue;
        }
        // Fallback: treat `**` as `*` in unexpected positions
        re += "[^/]*";
        i += 2;
        continue;
      }
      // Single `*` — match anything except `/`
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    // Escape regex metachars
    if (/[.+^$|(){}\[\]\\]/.test(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
    i += 1;
  }

  // Build the full regex.
  //   - Anchored: must match from start
  //   - Otherwise: may match at root OR inside any subdirectory (so pattern `foo`
  //     matches `foo`, `bar/foo`, `bar/baz/foo`)
  // In both cases the match runs to end-of-string so `dist` doesn't match `distance`.
  const prefix = anchored ? "^" : "^(?:.*/)?";
  try {
    return new RegExp(`${prefix}${re}$`);
  } catch {
    return null;
  }
}

function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine;
    // Skip blank lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const regex = patternToRegex(line);
    if (!regex) continue;
    rules.push({ regex, negated, dirOnly });
  }
  return rules;
}

const EMPTY_MATCHER: GitignoreMatcher = {
  isIgnored: () => false,
  isIgnoredDir: () => false,
};

export async function loadGitignore(projectPath: string): Promise<GitignoreMatcher> {
  let text: string;
  try {
    text = await readFile(join(projectPath, ".gitignore"), "utf-8");
  } catch {
    return EMPTY_MATCHER;
  }

  const rules = parseRules(text);
  if (rules.length === 0) return EMPTY_MATCHER;

  // gitignore semantics: later rules override earlier ones. A `!pattern` can
  // un-ignore something matched by an earlier rule. So we iterate all rules and
  // the last match wins.
  function matches(relPath: string, asDir: boolean): boolean {
    const norm = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !asDir) continue;
      if (rule.regex.test(norm)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }

  return {
    isIgnored: (relPath) => matches(relPath, false),
    isIgnoredDir: (relPath) => matches(relPath, true),
  };
}
