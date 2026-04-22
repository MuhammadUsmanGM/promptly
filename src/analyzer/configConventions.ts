import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

// Ground-truth convention values extracted from tool configs. Any field left
// `undefined` means "the configs don't specify this — fall back to sampling".
// Fields that ARE set should be treated as 1.0 confidence — they're explicit.
export interface ConfigConventions {
  quotes?: "single" | "double";
  semicolons?: boolean;
  indentation?: "tabs" | "spaces";
  indentSize?: number;
  // Track what we actually found (for logging / debugging), and which files
  // contributed — handy when the agent asks "why do you think X".
  sources: string[];
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    await access(path);
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

// --- Prettier -----------------------------------------------------------------
// Prettier's .prettierrc can be JSON, YAML, JS, or a field in package.json.
// We read the text and regex-extract the two settings we care about. This is
// loose on purpose — we don't want to depend on yaml/js parsers, and the two
// keys we care about (`singleQuote`, `semi`) have a near-universal shape.

interface PrettierExtract {
  quotes?: "single" | "double";
  semicolons?: boolean;
  tabWidth?: number;
  useTabs?: boolean;
}

function parsePrettier(text: string): PrettierExtract {
  const out: PrettierExtract = {};

  // singleQuote: true → single, false → double. Works for JSON, YAML, and JS.
  const sq = text.match(/["']?singleQuote["']?\s*[:=]\s*(true|false)/);
  if (sq) out.quotes = sq[1] === "true" ? "single" : "double";

  // semi: false → no semis; semi: true (explicit) or absent → semis.
  const semi = text.match(/["']?semi["']?\s*[:=]\s*(true|false)/);
  if (semi) out.semicolons = semi[1] === "true";

  const tw = text.match(/["']?tabWidth["']?\s*[:=]\s*(\d+)/);
  if (tw) out.tabWidth = parseInt(tw[1], 10);

  const ut = text.match(/["']?useTabs["']?\s*[:=]\s*(true|false)/);
  if (ut) out.useTabs = ut[1] === "true";

  return out;
}

async function readPrettierConfig(projectPath: string): Promise<{ data: PrettierExtract; source: string } | null> {
  const candidates = [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yaml",
    ".prettierrc.yml",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    ".prettierrc.ts",
    "prettier.config.js",
    "prettier.config.cjs",
    "prettier.config.mjs",
    "prettier.config.ts",
  ];
  for (const name of candidates) {
    const content = await readIfExists(join(projectPath, name));
    if (content !== null) {
      return { data: parsePrettier(content), source: name };
    }
  }

  // package.json "prettier" field
  const pkgRaw = await readIfExists(join(projectPath, "package.json"));
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      if (pkg.prettier && typeof pkg.prettier === "object") {
        // Re-serialize so the same regex works uniformly.
        return { data: parsePrettier(JSON.stringify(pkg.prettier)), source: "package.json#prettier" };
      }
    } catch { /* invalid JSON — handled elsewhere */ }
  }
  return null;
}

// --- EditorConfig -------------------------------------------------------------
// INI-style. Sections are glob patterns; we care about the root [*] section and
// any section that explicitly covers our code extensions. Keys of interest:
// indent_style (tab|space), indent_size (integer), quote_type (single|double —
// rare but some teams use it), insert_final_newline (not relevant here).

interface EditorConfigExtract {
  indentation?: "tabs" | "spaces";
  indentSize?: number;
  quotes?: "single" | "double";
}

function parseEditorConfig(text: string): EditorConfigExtract {
  const out: EditorConfigExtract = {};
  let inRelevantSection = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[#;].*$/, "").trim(); // drop comments
    if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const pattern = sectionMatch[1];
      // Relevant if it's the wildcard section OR matches any common code ext.
      inRelevantSection =
        pattern === "*" ||
        /\*\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)/i.test(pattern) ||
        pattern.includes("{") && /ts|js/i.test(pattern);
      continue;
    }
    if (!inRelevantSection) continue;

    const kv = line.match(/^([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].toLowerCase().replace(/["']/g, "");
    if (key === "indent_style") {
      if (value === "tab") out.indentation = "tabs";
      else if (value === "space") out.indentation = "spaces";
    } else if (key === "indent_size") {
      const n = parseInt(value, 10);
      if (!isNaN(n)) out.indentSize = n;
    } else if (key === "quote_type") {
      if (value === "single" || value === "double") out.quotes = value;
    }
  }
  return out;
}

async function readEditorConfig(projectPath: string): Promise<{ data: EditorConfigExtract; source: string } | null> {
  const content = await readIfExists(join(projectPath, ".editorconfig"));
  if (!content) return null;
  return { data: parseEditorConfig(content), source: ".editorconfig" };
}

// --- ESLint -------------------------------------------------------------------
// Extracting rules out of ESLint configs without running the resolver is
// inherently lossy — shareable configs like `"extends": "airbnb"` encode most
// rules externally. We only pull explicit settings from the local file, which
// covers the common case of teams overriding quotes/semis at the project level.

interface EslintExtract {
  quotes?: "single" | "double";
  semicolons?: boolean;
  indentation?: "tabs" | "spaces";
  indentSize?: number;
}

function parseEslint(text: string): EslintExtract {
  const out: EslintExtract = {};

  // Rule keys are often quoted in JSON/YAML (`"quotes": ...`) but usually bare
  // identifiers in JS flat configs (`quotes: [...]`). Handle both by making
  // the surrounding quote chars optional.
  const key = (name: string) => `["']?${name}["']?`;

  // `quotes: ["error", "single"]` / `"quotes": ["error", "double"]`
  const quoteRule = text.match(new RegExp(`${key("quotes")}\\s*:\\s*\\[\\s*["'][^"']+["']\\s*,\\s*["'](single|double)["']`));
  if (quoteRule) out.quotes = quoteRule[1] as "single" | "double";

  // `semi: ["error", "never"|"always"]`
  const semiRule = text.match(new RegExp(`${key("semi")}\\s*:\\s*\\[\\s*["'][^"']+["']\\s*,\\s*["'](never|always)["']`));
  if (semiRule) out.semicolons = semiRule[1] === "always";

  // Short form: `semi: "error"` → no config info, don't set.

  // `indent: ["error", "tab"]`  → tabs
  // `indent: ["error", 2]`      → spaces, size 2
  const indentRule = text.match(new RegExp(`${key("indent")}\\s*:\\s*\\[\\s*["'][^"']+["']\\s*,\\s*(["']tab["']|\\d+)`));
  if (indentRule) {
    const v = indentRule[1];
    if (/^["']tab["']$/.test(v)) out.indentation = "tabs";
    else {
      out.indentation = "spaces";
      out.indentSize = parseInt(v, 10);
    }
  }

  return out;
}

async function readEslintConfig(projectPath: string): Promise<{ data: EslintExtract; source: string } | null> {
  const candidates = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    ".eslintrc",
  ];
  for (const name of candidates) {
    const content = await readIfExists(join(projectPath, name));
    if (content !== null) {
      return { data: parseEslint(content), source: name };
    }
  }
  // package.json "eslintConfig" field
  const pkgRaw = await readIfExists(join(projectPath, "package.json"));
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      if (pkg.eslintConfig && typeof pkg.eslintConfig === "object") {
        return { data: parseEslint(JSON.stringify(pkg.eslintConfig)), source: "package.json#eslintConfig" };
      }
    } catch { /* ignore */ }
  }
  return null;
}

// --- Merge --------------------------------------------------------------------
// Precedence when configs disagree: prettier > eslint > editorconfig.
// Prettier is the thing that actually rewrites code on save for most teams,
// so it's the strongest signal. EditorConfig is widely adopted but usually
// only covers indent. ESLint sits in between — it's enforced but not always
// the formatter. If a field isn't set anywhere, leave it undefined so the
// sampling detector can fill it in.

export async function detectConfigConventions(projectPath: string): Promise<ConfigConventions> {
  const [prettier, eslint, editor] = await Promise.all([
    readPrettierConfig(projectPath),
    readEslintConfig(projectPath),
    readEditorConfig(projectPath),
  ]);

  const sources: string[] = [];
  const out: ConfigConventions = { sources };

  // Lower-priority first so higher-priority can overwrite.
  if (editor) {
    sources.push(editor.source);
    if (editor.data.indentation) out.indentation = editor.data.indentation;
    if (editor.data.indentSize !== undefined) out.indentSize = editor.data.indentSize;
    if (editor.data.quotes) out.quotes = editor.data.quotes;
  }
  if (eslint) {
    sources.push(eslint.source);
    if (eslint.data.quotes) out.quotes = eslint.data.quotes;
    if (eslint.data.semicolons !== undefined) out.semicolons = eslint.data.semicolons;
    if (eslint.data.indentation) out.indentation = eslint.data.indentation;
    if (eslint.data.indentSize !== undefined) out.indentSize = eslint.data.indentSize;
  }
  if (prettier) {
    sources.push(prettier.source);
    if (prettier.data.quotes) out.quotes = prettier.data.quotes;
    if (prettier.data.semicolons !== undefined) out.semicolons = prettier.data.semicolons;
    if (prettier.data.tabWidth !== undefined) out.indentSize = prettier.data.tabWidth;
    if (prettier.data.useTabs !== undefined) {
      out.indentation = prettier.data.useTabs ? "tabs" : "spaces";
    }
  }

  return out;
}
