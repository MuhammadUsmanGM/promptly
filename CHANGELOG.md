# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-04-22

### Added

- **Monorepo awareness** — `resolveAnalysisRoot` detects npm / yarn / pnpm / Turborepo workspaces and narrows analysis into the sub-package the prompt is about, driven by `target_files` hints and path-looking tokens extracted from the raw prompt. `CodebaseContext.workspace` exposes the analysis root, label, and package count; the rewriter prepends a workspace note so the agent knows whether context was scoped or repo-wide.
- **User rules prelude** — `loadUserRules` reads `CLAUDE.md` / `.cursorrules` / `GEMINI.md` / `QWEN.md` (project, analysis root, and `$HOME`) and inlines the content at the top of every refined prompt with a "these override anything below when they conflict" banner, so your ground-truth rules always win over inferred conventions.
- **Persistent disk cache** — analysis results are now persisted to `.promptly/cache.json`, fingerprinted by the contents + mtimes of `package.json` and `tsconfig.json`. Survives MCP restarts; invalidates automatically when dependencies change. Paired with the existing in-memory cache + file watchers.
- **Weighted intent scoring** — `detectIntent` switched from first-match-wins to weighted pattern scoring. Strong signals ("bug", "configure ESLint", "write tests for X") outrank weak ones ("add"), so intent no longer depends on block ordering.
- **`test` intent** — new intent for "write tests for X" / "add test coverage" prompts. Anchors on the detected test runner, points at files under test, enforces test-location convention (colocated / `__tests__` / `test/` / `.spec.*`), and asks for happy + edge + error coverage without modifying code under test.
- **Git-aware file relevance** — `refine_prompt` now pulls the last 20 commits (60s per-call cache) and uses recently-changed files as a weak relevance signal. Combined with the new `target_files` (strongest, 5×) and `context_files` (3×) inputs, relevance scoring has three tiers of priors instead of keyword matching alone.
- **Ground-truth conventions from tool configs** — `detectConfigConventions` reads `.prettierrc` (JSON / YAML / JS / package.json field), `.editorconfig`, and ESLint configs for quotes, semicolons, indentation, and indent size. When a tool config sets a value, it wins over code sampling and gets full confidence.
- **Expanded stack detection** — meta-frameworks (Next.js, Remix, Nuxt, SvelteKit, SolidStart, Astro, Tanstack Start, Angular), backend frameworks (NestJS, tRPC, Fastify, Koa, Hapi, Hono, Express), Python (Django, FastAPI, Flask, Starlette + SQLAlchemy / Tortoise / Peewee + pytest / nose), Go (Gin, Echo, Fiber, Chi, Gorilla Mux, Beego, Revel + GORM / Bun / Ent / sqlx), Rust (Axum, Actix, Rocket, Warp, Poem, Salvo, Tide + Diesel / SeaORM / sqlx), and Deno (Hono, Oak, Fresh via imports).
- **`.gitignore`-aware walking** — structure walker and convention sampler both honor the repo's `.gitignore`, so `dist/`, `*.generated.ts`, `coverage/`, etc. no longer skew sampled conventions or pollute the surfaced file list.
- **`rewriteExplain` prelude** — `explain` prompts now get a one-line stack summary plus a key-areas map (`src/api (API layer)`, `src/components (UI components)`, ...) prepended so the agent's answer is grounded in this repo instead of generic framework knowledge. The user's question is preserved verbatim.
- **`promptly doctor`** — validates wiring beyond what `status` checks: MCP config parses as JSON, the `promptly` command resolves on `PATH`, the instruction file contains the `refine_prompt` token (not just the legacy "Promptly" string). Per-agent findings with ok / warn / err severity. `--json` for scripting, `--strict` to exit 1 on warnings for CI gating.
- **`promptly inspect [path]`** — prints exactly what `analyzeCodebase` sees for a project: stack, conventions (with confidence colors), structure, user rules, workspace. Accepts `--agent <id>` to preview which user-rules file the rewriter would pick, `--hints <paths>` to preview monorepo narrowing, and `--json` for piping into jq.
- **`promptly status --json`** — machine-readable output mirroring the human view (configured agents only).

### Changed

- `refine_prompt` now accepts `target_files` (explicit prompt targets; used for monorepo routing and strongest relevance boost) and `context_files` (files the agent has open; weaker boost, no monorepo effect). Both are documented in the tool schema so the calling agent knows when to send which.
- File list from `detectStructure` is now prioritized (keyDir files → shallow paths → alphabetical) and capped at 200 entries. Removes the old token cost from surfacing hundreds of deep paths that never influenced scoring.
- Rewriter prelude order locked in: user rules first (ground truth), then workspace scoping note, then the intent-specific body.
- Internal: dead code paths removed from the analyzer (unused ASCII tree serialization, unused dependency categorizer, unused variable-name sampling) so the cached `CodebaseContext` is leaner on disk and in flight.

## [1.0.4] - 2026-04-13

### Fixed

- Intent detection: "configure" now correctly wins over "create" for prompts like "set up ESLint" or "add eslint"
- File naming detection: single-word filenames (index, utils, main) no longer falsely counted as kebab-case
- `ensureImperative` no longer drops context from longer prompts — only rewrites when action verb is near the start
- Claude Code "project" scope now correctly writes MCP config to `.claude/settings.json` in the project directory instead of the global config
- Esc key handling in `promptly init` properly distinguishes Esc from arrow key sequences

### Changed

- Removed postinstall welcome message (npm v7+ suppresses lifecycle script output)
- Enhanced README Quick Start with step-by-step setup instructions

## [1.0.3] - 2026-04-13

### Fixed

- Postinstall script changed from ESM dynamic import to direct `node dist/postinstall.js` call
- Postinstall output switched to `console.error` (stderr) to avoid npm output suppression

## [1.0.2] - 2026-04-12

### Added

- Qwen Code support in `promptly init`, `promptly status`, MCP tools, and README

### Fixed

- Naming convention detection: camelCase now requires uppercase char, snake_case requires underscore (single-word names no longer match both)
- `testLocation` detection no longer overwrites `__tests__` with `test_dir`
- Stack detection null check for undefined framework names

## [1.0.1] - 2026-04-10

### Added

- Multi-agent init support: Claude Code, Cursor, and Gemini CLI
- Arrow-key based agent and scope selection in `promptly init`
- Esc to go back and Ctrl+C to cancel in setup wizard
- Intent detection engine (create, fix, refactor, explain, configure)
- Prompt rewriting — single coherent rewritten prompt instead of appending rules
- Smart convention injection with confidence scoring and per-intent scoping
- File relevance detection with keyword matching and directory boosting
- File-watcher based cache invalidation (watches package.json, tsconfig.json)
- Conditional package install constraint (skipped when user explicitly asks to install)

### Changed

- Merged 3 MCP tools down to 2 (`refine_prompt` and `get_refinement_rules`) for token efficiency
- Cache TTL increased from 5 minutes to 30 minutes
- Compact output format to reduce token consumption

## [1.0.0] - 2026-04-09

### Added

- Initial release of Promptly
- MCP server with 3 tools: `analyze_codebase`, `refine_prompt`, `get_refinement_rules`
- Codebase analyzer with stack detection, convention analysis, structure mapping, and dependency awareness
- Stack detection for JavaScript/TypeScript, Go, Rust, and Python projects
- Framework detection: Next.js, React, Vue, Svelte, Nuxt, Express, Fastify, Hono, Astro, Remix, Angular
- Styling detection: Tailwind CSS, styled-components, Emotion, Sass
- ORM detection: Prisma, Drizzle, TypeORM, Sequelize, Mongoose, Knex
- Test runner detection: Vitest, Jest, Mocha, Playwright, Cypress
- Code convention detection: naming, file naming, exports, quotes, semicolons, indentation
- Dependency categorization: UI, state, HTTP, database, auth, server, testing, build, linting
- Agent-specific refinement rules for Claude Code, Cursor, and Gemini CLI
- CLI commands: `init`, `mcp`, `status`, `rules`
- `promptly init` setup wizard for Claude Code configuration
