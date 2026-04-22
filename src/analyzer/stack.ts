import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { StackInfo } from "../rules/index.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
  type?: string;
  module?: string;
}

// Helper: first version hit across dep + devDep, stripped of range prefix.
function dep(pkg: PackageJson, name: string): string | null {
  const v = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  return v ? v.replace(/[\^~><=]/g, "").trim() : null;
}

// Order matters — more specific frameworks MUST come before their base libraries
// (SvelteKit before Svelte, SolidStart before Solid, Next/Remix before React).
const FRAMEWORK_DETECTORS: { name: string; detect: (pkg: PackageJson) => string | null }[] = [
  // Meta-frameworks first — they depend on the base libraries, so the base
  // detector would swallow them otherwise.
  { name: "Next.js", detect: (pkg) => {
    const v = dep(pkg, "next");
    return v ? `Next.js ${v}` : null;
  }},
  { name: "Remix", detect: (pkg) => {
    const v = dep(pkg, "@remix-run/react") ?? dep(pkg, "@remix-run/node");
    return v ? `Remix ${v}` : null;
  }},
  { name: "Tanstack Start", detect: (pkg) => {
    const v = dep(pkg, "@tanstack/start") ?? dep(pkg, "@tanstack/react-start");
    return v ? `Tanstack Start ${v}` : null;
  }},
  { name: "SvelteKit", detect: (pkg) => {
    const v = dep(pkg, "@sveltejs/kit");
    return v ? `SvelteKit ${v}` : null;
  }},
  { name: "SolidStart", detect: (pkg) => {
    const v = dep(pkg, "@solidjs/start") ?? dep(pkg, "solid-start");
    return v ? `SolidStart ${v}` : null;
  }},
  { name: "Nuxt", detect: (pkg) => {
    const v = dep(pkg, "nuxt");
    return v ? `Nuxt ${v}` : null;
  }},
  { name: "Astro", detect: (pkg) => {
    const v = dep(pkg, "astro");
    return v ? `Astro ${v}` : null;
  }},
  { name: "Angular", detect: (pkg) => {
    const v = dep(pkg, "@angular/core");
    return v ? `Angular ${v}` : null;
  }},

  // Backend frameworks — Nest before Express since Nest depends on express/fastify.
  { name: "NestJS", detect: (pkg) => {
    const v = dep(pkg, "@nestjs/core");
    return v ? `NestJS ${v}` : null;
  }},
  { name: "tRPC", detect: (pkg) => {
    // tRPC is a layer, not a server — but it's the thing that shapes the API.
    // Report it specifically; pairs with Next/Express/Fastify at the runtime level.
    const v = dep(pkg, "@trpc/server");
    return v ? `tRPC ${v}` : null;
  }},
  { name: "Fastify", detect: (pkg) => {
    const v = dep(pkg, "fastify");
    return v ? `Fastify ${v}` : null;
  }},
  { name: "Koa", detect: (pkg) => {
    const v = dep(pkg, "koa");
    return v ? `Koa ${v}` : null;
  }},
  { name: "Hapi", detect: (pkg) => {
    const v = dep(pkg, "@hapi/hapi");
    return v ? `Hapi ${v}` : null;
  }},
  { name: "Hono", detect: (pkg) => {
    const v = dep(pkg, "hono");
    return v ? `Hono ${v}` : null;
  }},
  { name: "Express", detect: (pkg) => {
    const v = dep(pkg, "express");
    return v ? `Express ${v}` : null;
  }},

  // Base UI libraries — last, so meta-frameworks above win when both are present.
  { name: "React", detect: (pkg) => {
    const v = dep(pkg, "react");
    return v ? `React ${v}` : null;
  }},
  { name: "Vue", detect: (pkg) => {
    const v = dep(pkg, "vue");
    return v ? `Vue ${v}` : null;
  }},
  { name: "Svelte", detect: (pkg) => {
    const v = dep(pkg, "svelte");
    return v ? `Svelte ${v}` : null;
  }},
  { name: "SolidJS", detect: (pkg) => {
    const v = dep(pkg, "solid-js");
    return v ? `SolidJS ${v}` : null;
  }},
];

const STYLING_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Tailwind CSS": (pkg) => !!dep(pkg, "tailwindcss"),
  "styled-components": (pkg) => !!dep(pkg, "styled-components"),
  "Emotion": (pkg) => !!dep(pkg, "@emotion/react"),
  "CSS Modules": () => false, // detected via file scan
  "Sass": (pkg) => !!dep(pkg, "sass"),
};

const ORM_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Prisma": (pkg) => !!(dep(pkg, "prisma") ?? dep(pkg, "@prisma/client")),
  "Drizzle": (pkg) => !!dep(pkg, "drizzle-orm"),
  "TypeORM": (pkg) => !!dep(pkg, "typeorm"),
  "Sequelize": (pkg) => !!dep(pkg, "sequelize"),
  "Mongoose": (pkg) => !!dep(pkg, "mongoose"),
  "Knex": (pkg) => !!dep(pkg, "knex"),
};

const TEST_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Vitest": (pkg) => !!dep(pkg, "vitest"),
  "Jest": (pkg) => !!dep(pkg, "jest"),
  "Mocha": (pkg) => !!dep(pkg, "mocha"),
  "Playwright": (pkg) => !!dep(pkg, "@playwright/test"),
  "Cypress": (pkg) => !!dep(pkg, "cypress"),
  // bun test / deno test are runtime-native; no package to detect. Stack.runtime
  // covers those cases — the agent can infer the runner from the runtime.
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(projectPath: string, pkg: PackageJson): Promise<string> {
  if (pkg.packageManager) {
    const pm = pkg.packageManager.split("@")[0];
    if (pm) return pm;
  }
  if (await fileExists(join(projectPath, "bun.lockb")) || await fileExists(join(projectPath, "bun.lock"))) return "bun";
  if (await fileExists(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(join(projectPath, "yarn.lock"))) return "yarn";
  return "npm";
}

// Bun-native vs node: if there's a bun lockfile, the package manager is bun.
// The runtime is bun ONLY if engines.bun is set or there's no engines.node.
// This matters because "bun install" in a node project is common — that
// shouldn't flip the reported runtime.
async function detectRuntime(projectPath: string, pkg: PackageJson, pm: string): Promise<string | undefined> {
  if (pkg.engines?.["node"]) return `Node ${pkg.engines["node"]}`;
  if (pkg.engines?.["bun"]) return `Bun ${pkg.engines["bun"]}`;
  // No engines field — infer from lockfile. Bun lockfile + no node engines = bun project.
  if (pm === "bun") return "Bun";
  return undefined;
}

// --- Python ---
function parsePythonDeps(text: string): Set<string> {
  // Works for both requirements.txt (one pkg per line) and pyproject.toml
  // dependency arrays / poetry deps. We're intentionally loose — we just need
  // to know whether `fastapi`, `django`, `flask` appear as top-level deps.
  const names = new Set<string>();

  // First pass: grab every quoted token. This catches inline pyproject arrays
  // (`dependencies = ["fastapi", "pydantic"]`) and poetry table keys
  // (`fastapi = "^0.110"`). Requirements.txt rarely has quotes, so this is a
  // no-op there and we fall through to the line-by-line pass.
  for (const match of text.matchAll(/["']([A-Za-z0-9_.\-]+)(?:\s*[<>=~!]+[^"']*)?["']/g)) {
    names.add(match[1].toLowerCase());
  }

  // Second pass: line-oriented, for requirements.txt and Pipfile-style entries.
  // "fastapi>=0.110", "fastapi==0.110.0", "fastapi ~= 0.110", `fastapi = "^0.110"`.
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.\-]+)(?:[<>=~!\s]|$)/);
    if (match) names.add(match[1].toLowerCase());
  }

  return names;
}

async function detectPythonStack(projectPath: string): Promise<StackInfo | null> {
  const reqTxtPath = join(projectPath, "requirements.txt");
  const pyprojectPath = join(projectPath, "pyproject.toml");
  const pipfilePath = join(projectPath, "Pipfile");

  const hasReq = await fileExists(reqTxtPath);
  const hasPyproject = await fileExists(pyprojectPath);
  const hasPipfile = await fileExists(pipfilePath);

  if (!hasReq && !hasPyproject && !hasPipfile) return null;

  const deps = new Set<string>();
  if (hasReq) {
    try { parsePythonDeps(await readFile(reqTxtPath, "utf-8")).forEach((d) => deps.add(d)); } catch {}
  }
  if (hasPyproject) {
    try { parsePythonDeps(await readFile(pyprojectPath, "utf-8")).forEach((d) => deps.add(d)); } catch {}
  }
  if (hasPipfile) {
    try { parsePythonDeps(await readFile(pipfilePath, "utf-8")).forEach((d) => deps.add(d)); } catch {}
  }

  let framework: string | undefined;
  if (deps.has("django")) framework = "Django";
  else if (deps.has("fastapi")) framework = "FastAPI";
  else if (deps.has("flask")) framework = "Flask";
  else if (deps.has("starlette")) framework = "Starlette";
  else if (deps.has("aiohttp")) framework = "aiohttp";
  else if (deps.has("tornado")) framework = "Tornado";

  let orm: string | undefined;
  if (deps.has("sqlalchemy")) orm = "SQLAlchemy";
  else if (deps.has("django")) orm = "Django ORM";
  else if (deps.has("tortoise-orm")) orm = "Tortoise ORM";
  else if (deps.has("peewee")) orm = "Peewee";

  let testRunner: string | undefined;
  if (deps.has("pytest")) testRunner = "pytest";
  else if (deps.has("nose2") || deps.has("nose")) testRunner = "nose";

  // Package manager preference: poetry > pipenv > pip
  const packageManager = hasPipfile
    ? "pipenv"
    : hasPyproject
      ? "poetry"
      : "pip";

  return { language: "Python", framework, orm, testRunner, packageManager };
}

// --- Go ---
async function detectGoStack(projectPath: string): Promise<StackInfo | null> {
  const goModPath = join(projectPath, "go.mod");
  if (!await fileExists(goModPath)) return null;

  let content = "";
  try { content = await readFile(goModPath, "utf-8"); } catch { return { language: "Go", packageManager: "go mod" }; }

  const versionMatch = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
  const runtime = versionMatch ? `Go ${versionMatch[1]}` : undefined;

  // require blocks or single-line require. We just look for substring hits —
  // order matters here too since fiber is built on fasthttp.
  const has = (name: string) => content.includes(name);
  let framework: string | undefined;
  if (has("github.com/gin-gonic/gin")) framework = "Gin";
  else if (has("github.com/labstack/echo")) framework = "Echo";
  else if (has("github.com/gofiber/fiber")) framework = "Fiber";
  else if (has("github.com/go-chi/chi")) framework = "Chi";
  else if (has("github.com/gorilla/mux")) framework = "Gorilla Mux";
  else if (has("github.com/beego/beego")) framework = "Beego";
  else if (has("github.com/revel/revel")) framework = "Revel";

  let orm: string | undefined;
  if (has("gorm.io/gorm")) orm = "GORM";
  else if (has("github.com/uptrace/bun")) orm = "Bun";
  else if (has("entgo.io/ent")) orm = "Ent";
  else if (has("github.com/jmoiron/sqlx")) orm = "sqlx";

  return { language: "Go", framework, orm, runtime, packageManager: "go mod" };
}

// --- Rust ---
async function detectRustStack(projectPath: string): Promise<StackInfo | null> {
  const cargoPath = join(projectPath, "Cargo.toml");
  if (!await fileExists(cargoPath)) return null;

  let content = "";
  try { content = await readFile(cargoPath, "utf-8"); } catch { return { language: "Rust", packageManager: "cargo" }; }

  const editionMatch = content.match(/edition\s*=\s*"(\d+)"/);
  const runtime = editionMatch ? `Rust (edition ${editionMatch[1]})` : undefined;

  // Look for dep entries — either `name = "..."` under [dependencies] or table form
  // `[dependencies.name]`. Substring hits are good enough given Cargo naming norms.
  const has = (name: string) => {
    const re = new RegExp(`(^|\\n)\\s*${name.replace(/-/g, "\\-")}\\s*=`, "m");
    return re.test(content) || content.includes(`[dependencies.${name}]`);
  };

  let framework: string | undefined;
  if (has("axum")) framework = "Axum";
  else if (has("actix-web")) framework = "Actix Web";
  else if (has("rocket")) framework = "Rocket";
  else if (has("warp")) framework = "Warp";
  else if (has("poem")) framework = "Poem";
  else if (has("salvo")) framework = "Salvo";
  else if (has("tide")) framework = "Tide";

  let orm: string | undefined;
  if (has("diesel")) orm = "Diesel";
  else if (has("sea-orm")) orm = "SeaORM";
  else if (has("sqlx")) orm = "sqlx";

  return { language: "Rust", framework, orm, runtime, packageManager: "cargo" };
}

// --- Deno ---
async function detectDenoStack(projectPath: string): Promise<StackInfo | null> {
  // deno.json or deno.jsonc signals a Deno project. Language is TS by default.
  const hasJson = await fileExists(join(projectPath, "deno.json"));
  const hasJsonc = await fileExists(join(projectPath, "deno.jsonc"));
  if (!hasJson && !hasJsonc) return null;

  let content = "";
  try {
    content = await readFile(join(projectPath, hasJson ? "deno.json" : "deno.jsonc"), "utf-8");
  } catch {
    return { language: "TypeScript", runtime: "Deno", packageManager: "deno" };
  }

  // Framework detection via imports field (JSR / HTTP imports). Just substring.
  let framework: string | undefined;
  if (content.includes("@hono/hono") || content.includes("hono@")) framework = "Hono";
  else if (content.includes("oak@") || content.includes("@oakserver/oak")) framework = "Oak";
  else if (content.includes("fresh/")) framework = "Fresh";

  return { language: "TypeScript", framework, runtime: "Deno", packageManager: "deno" };
}

export async function detectStack(projectPath: string): Promise<StackInfo | null> {
  // Deno takes precedence over package.json — a deno.json + package.json project
  // is almost certainly a Deno app with a package.json for editor tooling only.
  // Order: deno → package.json → Python → Go → Rust.
  const deno = await detectDenoStack(projectPath);
  if (deno) return deno;

  // JS/TS ecosystem
  try {
    const raw = await readFile(join(projectPath, "package.json"), "utf-8");
    const pkg: PackageJson = JSON.parse(raw);

    const language = dep(pkg, "typescript") ? "TypeScript" : "JavaScript";

    let framework: string | undefined;
    for (const { detect } of FRAMEWORK_DETECTORS) {
      const result = detect(pkg);
      if (result) { framework = result; break; }
    }

    let styling: string | undefined;
    for (const [name, detect] of Object.entries(STYLING_DETECTORS)) {
      if (detect(pkg)) { styling = name; break; }
    }

    let orm: string | undefined;
    for (const [name, detect] of Object.entries(ORM_DETECTORS)) {
      if (detect(pkg)) { orm = name; break; }
    }

    let testRunner: string | undefined;
    for (const [name, detect] of Object.entries(TEST_DETECTORS)) {
      if (detect(pkg)) { testRunner = name; break; }
    }

    const packageManager = await detectPackageManager(projectPath, pkg);
    const runtime = await detectRuntime(projectPath, pkg, packageManager);

    return { language, framework, styling, orm, packageManager, runtime, testRunner };
  } catch {
    // Not a JS project — try others
  }

  const py = await detectPythonStack(projectPath);
  if (py) return py;

  const go = await detectGoStack(projectPath);
  if (go) return go;

  const rust = await detectRustStack(projectPath);
  if (rust) return rust;

  return null;
}
