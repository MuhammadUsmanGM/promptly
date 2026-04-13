# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
