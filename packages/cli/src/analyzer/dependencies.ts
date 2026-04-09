import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DependencyInfo, DependencyEntry } from "@promptly/rules";

const CATEGORIES: Record<string, string[]> = {
  "UI Framework": ["react", "vue", "svelte", "@angular/core", "solid-js", "preact"],
  "Meta Framework": ["next", "nuxt", "@remix-run/react", "astro", "@sveltejs/kit", "gatsby"],
  "Styling": ["tailwindcss", "styled-components", "@emotion/react", "sass", "less", "@mantine/core", "@chakra-ui/react", "antd", "@radix-ui/react-*"],
  "State": ["zustand", "jotai", "recoil", "@reduxjs/toolkit", "redux", "mobx", "valtio", "pinia", "vuex"],
  "HTTP": ["axios", "ky", "got", "node-fetch", "undici", "@tanstack/react-query", "swr"],
  "Database": ["@prisma/client", "drizzle-orm", "typeorm", "sequelize", "mongoose", "knex", "pg", "mysql2", "better-sqlite3", "redis", "ioredis"],
  "ORM/Schema": ["prisma", "drizzle-kit", "zod", "yup", "joi", "ajv", "valibot", "superstruct"],
  "Auth": ["next-auth", "@auth/core", "passport", "jsonwebtoken", "bcrypt", "lucia"],
  "Server": ["express", "fastify", "hono", "koa", "@nestjs/core", "h3"],
  "Testing": ["vitest", "jest", "@playwright/test", "cypress", "mocha", "chai", "@testing-library/react", "supertest"],
  "Build": ["tsup", "esbuild", "rollup", "vite", "webpack", "turbo", "nx"],
  "Linting": ["eslint", "prettier", "biome", "@biomejs/biome", "oxlint"],
};

function categorize(pkgName: string): string {
  for (const [category, packages] of Object.entries(CATEGORIES)) {
    for (const pattern of packages) {
      if (pattern.endsWith("*")) {
        if (pkgName.startsWith(pattern.slice(0, -1))) return category;
      } else if (pkgName === pattern) {
        return category;
      }
    }
  }
  return "Other";
}

export async function detectDependencies(projectPath: string): Promise<DependencyInfo | null> {
  try {
    const raw = await readFile(join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);

    const production: DependencyEntry[] = Object.entries(pkg.dependencies ?? {}).map(
      ([name, version]) => ({
        name,
        version: version as string,
        category: categorize(name),
      })
    );

    const development: DependencyEntry[] = Object.entries(pkg.devDependencies ?? {}).map(
      ([name, version]) => ({
        name,
        version: version as string,
        category: categorize(name),
      })
    );

    // Group by category
    const categories: Record<string, string[]> = {};
    for (const dep of [...production, ...development]) {
      if (dep.category === "Other") continue;
      if (!categories[dep.category]) categories[dep.category] = [];
      categories[dep.category].push(dep.name);
    }

    return { production, development, categories };
  } catch {
    return null;
  }
}
