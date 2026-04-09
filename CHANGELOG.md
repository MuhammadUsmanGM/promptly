# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
