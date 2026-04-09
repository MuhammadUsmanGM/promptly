import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StackInfo } from "@promptly/rules";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
}

const FRAMEWORK_DETECTORS: Record<string, (pkg: PackageJson) => string | null> = {
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
  },
};

const STYLING_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Tailwind CSS": (pkg) => !!(pkg.devDependencies?.["tailwindcss"] ?? pkg.dependencies?.["tailwindcss"]),
  "styled-components": (pkg) => !!pkg.dependencies?.["styled-components"],
  "Emotion": (pkg) => !!pkg.dependencies?.["@emotion/react"],
  "CSS Modules": () => false, // detected via file scan
  "Sass": (pkg) => !!(pkg.devDependencies?.["sass"] ?? pkg.dependencies?.["sass"]),
};

const ORM_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Prisma": (pkg) => !!(pkg.devDependencies?.["prisma"] ?? pkg.dependencies?.["@prisma/client"]),
  "Drizzle": (pkg) => !!pkg.dependencies?.["drizzle-orm"],
  "TypeORM": (pkg) => !!pkg.dependencies?.["typeorm"],
  "Sequelize": (pkg) => !!pkg.dependencies?.["sequelize"],
  "Mongoose": (pkg) => !!pkg.dependencies?.["mongoose"],
  "Knex": (pkg) => !!pkg.dependencies?.["knex"],
};

const TEST_DETECTORS: Record<string, (pkg: PackageJson) => boolean> = {
  "Vitest": (pkg) => !!(pkg.devDependencies?.["vitest"] ?? pkg.dependencies?.["vitest"]),
  "Jest": (pkg) => !!(pkg.devDependencies?.["jest"] ?? pkg.dependencies?.["jest"]),
  "Mocha": (pkg) => !!(pkg.devDependencies?.["mocha"]),
  "Playwright": (pkg) => !!(pkg.devDependencies?.["@playwright/test"]),
  "Cypress": (pkg) => !!(pkg.devDependencies?.["cypress"]),
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function detectPackageManager(projectPath: string, pkg: PackageJson): Promise<string> {
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

export async function detectStack(projectPath: string): Promise<StackInfo | null> {
  // Try package.json first (JS/TS ecosystem)
  try {
    const raw = await readFile(join(projectPath, "package.json"), "utf-8");
    const pkg: PackageJson = JSON.parse(raw);

    const language = (pkg.devDependencies?.["typescript"] || pkg.dependencies?.["typescript"])
      ? "TypeScript"
      : "JavaScript";

    let framework: string | undefined;
    for (const detect of Object.values(FRAMEWORK_DETECTORS)) {
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
    const runtime = pkg.engines?.["node"]
      ? `Node ${pkg.engines["node"]}`
      : pkg.engines?.["bun"]
        ? `Bun ${pkg.engines["bun"]}`
        : undefined;

    return { language, framework, styling, orm, packageManager, runtime, testRunner };
  } catch {
    // Not a JS project — try others
  }

  // Go
  if (await fileExists(join(projectPath, "go.mod"))) {
    return { language: "Go", packageManager: "go mod" };
  }

  // Rust
  if (await fileExists(join(projectPath, "Cargo.toml"))) {
    return { language: "Rust", packageManager: "cargo" };
  }

  // Python
  if (await fileExists(join(projectPath, "requirements.txt")) || await fileExists(join(projectPath, "pyproject.toml"))) {
    const hasPyproject = await fileExists(join(projectPath, "pyproject.toml"));
    return { language: "Python", packageManager: hasPyproject ? "pip/poetry" : "pip" };
  }

  return null;
}
