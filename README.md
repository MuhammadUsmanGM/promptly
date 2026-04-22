# Promptly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6)](https://modelcontextprotocol.io)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-F97316?logo=anthropic&logoColor=white)](https://claude.ai)
[![Cursor](https://img.shields.io/badge/Cursor-Ready-00D1FF?logo=cursor&logoColor=white)](https://cursor.com)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-Ready-4285F4?logo=google&logoColor=white)](https://geminicli.com)
[![Qwen Code](https://img.shields.io/badge/Qwen_Code-Ready-6F42C1)](https://github.com/QwenLM/qwen-code)
[![npm](https://img.shields.io/badge/npm-@promptly--ai/cli-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@promptly-ai/cli)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Better prompts. Better code. First time.**

Promptly is an MCP server that analyzes your codebase and refines your coding prompts before your AI agent acts on them. No extra API key. No separate model. Zero friction.

> The intelligence is Claude (or your agent). Promptly is the context it was missing.

---

## How It Works

```
You type a prompt
       ↓
Your AI agent calls Promptly's MCP tools
       ↓
Promptly scans your project (stack, conventions, structure, workspace, user rules)
       ↓
Promptly refines your prompt with real codebase context
       ↓
Your agent executes the refined, context-aware version
```

No external API call. No latency from a second model. Your agent just becomes more accurate when Promptly is connected.

---

## Features

| Feature | What It Does |
|---------|-------------|
| **Stack Detection** | Reads `package.json`, `tsconfig.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `deno.json`, etc. Detects framework, language, styling, ORM, test runner, package manager, runtime |
| **Convention Analysis** | Reads tool configs (`.prettierrc`, `.editorconfig`, ESLint) as ground truth, then samples code to infer file naming, export style, component pattern, quotes, semicolons, indentation, and test location — each with a confidence score |
| **Structure Mapping** | Walks your project, identifies key directories (components, hooks, utils, api, routes, stores, etc.), and surfaces a ranked slice of files for relevance scoring |
| **Workspace Awareness** | Detects npm / yarn / pnpm / Turborepo monorepos and narrows analysis to the sub-package the prompt is about via `target_files` hints |
| **User Rules Prelude** | Inlines your `CLAUDE.md` / `.cursorrules` / `GEMINI.md` / `QWEN.md` at the top of every refined prompt so your ground-truth rules always win |
| **Intent-Aware Rewriting** | Classifies each prompt as create / fix / refactor / explain / configure / test and rewrites with the conventions and constraints that actually fit that intent |

---

## Quick Start

### Step 1: Install

```bash
npm install -g @promptly-ai/cli
```

### Step 2: Run the setup wizard

```bash
promptly init
```

This will:
1. Ask which AI agent you're using (Claude Code, Cursor, Gemini CLI, or Qwen Code)
2. Ask whether to enable Promptly globally (all projects) or just the current project
3. Automatically configure the MCP server and instruction file for your agent

### Step 3: Restart your agent

That's it. Your agent will now call Promptly before acting on any coding prompt.

> **Don't want to install globally?** Use `npx @promptly-ai/cli init` instead — works the same way.

### Verify it's working

```bash
promptly status
```

This shows which agents are configured and where the MCP config + instruction files are located.

---

## CLI Commands

```bash
promptly init            # Set up Promptly (Claude Code, Cursor, Gemini CLI, or Qwen Code)
promptly mcp             # Start MCP server (called automatically by your agent)
promptly status          # Check which agents are configured
promptly doctor          # Validate wiring (MCP config parses, command resolves, instructions present)
promptly inspect [path]  # Print what analyzeCodebase sees for a project (add --json for jq)
promptly rules [agent]   # Print refinement rules (claude_code|cursor|gemini_cli|qwen_code|generic)
promptly --version       # Print version
```

`status` and `doctor` also accept `--json` for scripting. `doctor --strict` exits 1 on warnings (for CI gating). `inspect` accepts `--agent <id>` and `--hints <paths>` to preview what monorepo narrowing will pick.

---

## MCP Tools

### `refine_prompt`

The main tool. Detects intent, analyzes your codebase, and returns a rewritten prompt with project context baked in — not appended as footnotes.

**Inputs:** `raw_prompt`, `project_path`, optional `agent`, optional `target_files` (paths the prompt is about — used for monorepo routing and relevance scoring), optional `context_files` (files the agent currently has open).

**Caching:** Each analysis is cached in-memory for 30 minutes and persisted to `.promptly/cache.json`. The cache key includes the analysis root + agent, and the fingerprint of `package.json` + `tsconfig.json` — edit either and the cache invalidates automatically.

Example output for a `create` intent in a Next.js + Tailwind project:

```
Add a LoginForm component (using Next.js 14.1.0, TypeScript, styled with Tailwind CSS).
Place files in src/components. Relevant existing files: src/components/AuthLayout.tsx,
src/lib/auth.ts. Use kebab-case file names, named exports, single quotes, no semicolons.
Add a colocated test file using Vitest. Do not install new packages unless explicitly requested.

---
[Promptly] intent: create
```

For `fix`, the rewrite skips convention injection and instead constrains the change ("Touch only the files necessary for the fix. Do not refactor surrounding code…"). For `explain`, the user's question is preserved verbatim and a key-areas map is added above it. See `promptly rules <agent>` for the per-intent rewrite rules.

### `get_refinement_rules`

Returns the current ruleset. Only called if the user asks how Promptly works.

---

## Supported Agents

| Agent | `promptly init` | Rules | Codebase Analysis |
|-------|-----------------|-------|-------------------|
| **Claude Code** | ✔ | Full agent-specific rules | Full |
| **Cursor** | ✔ | Agent-specific rules | Full |
| **Gemini CLI** | ✔ | Agent-specific rules | Full |
| **Qwen Code** | ✔ | Agent-specific rules | Full |

### Setup Details

| Agent | MCP Config | Instruction File |
|-------|-----------|-----------------|
| Claude Code | `~/.claude/settings.json` | `CLAUDE.md` (global or project) |
| Cursor | `.cursor/mcp.json` (global or project) | `.cursorrules` (project) |
| Gemini CLI | `~/.gemini/settings.json` (global or project) | `GEMINI.md` (global or project) |
| Qwen Code | `~/.qwen/settings.json` (global or project) | `QWEN.md` (global or project) |

---

## Architecture

```
promptly/
├── src/
│   ├── analyzer/   # Codebase analysis (stack, conventions, structure, workspace, userRules)
│   ├── bin/        # CLI entrypoint
│   ├── cli/        # CLI commands (init, status, doctor, inspect, rules)
│   ├── mcp/        # MCP server, tool definitions, disk cache
│   └── rules/      # Intent detection + prompt rewriter
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Development

```bash
git clone https://github.com/MuhammadUsmanGM/promptly.git
cd promptly
npm install
npm run build
```

Test the CLI:

```bash
node dist/bin/promptly.js --help
node dist/bin/promptly.js rules claude_code
```

---

## How Refinement Works

Promptly rewrites the prompt — it doesn't just append rules. Each refinement runs through:

1. **Intent Detection** — Weighted regex scoring classifies the prompt as `create`, `fix`, `refactor`, `explain`, `configure`, `test`, or `generic`. Strong signals ("bug", "configure ESLint") outrank weak ones ("add") so intent doesn't hinge on word order.
2. **Analysis** — Stack, conventions, structure, monorepo layout, and user rules are gathered in parallel. Tool configs (`.prettierrc`, `.editorconfig`, ESLint) are treated as ground truth; sampling fills in what configs don't cover.
3. **User Rules Prelude** — If a `CLAUDE.md` / `.cursorrules` / `GEMINI.md` / `QWEN.md` exists (project or global), its content is inlined at the top of the refined prompt so your rules always win over inferred conventions.
4. **Monorepo Scoping** — If the project is a monorepo and `target_files` point into a sub-package, the analysis is narrowed to that package. Otherwise the rewrite notes that context is from the repo root and suggests passing hints.
5. **Intent-Specific Rewrite** — Each intent produces a different shape. `create` injects stack, file location, conventions, test runner, and the no-new-packages guardrail. `fix` adds stack context, constrains to minimal changes, preserves tests. `refactor` bakes in code style but not file naming. `explain` preserves the question verbatim and prepends a key-areas map. `configure` adds framework + package manager and points to the config directory. `test` anchors on the detected test runner and enforces test-location conventions.
6. **File Relevance Scoring** — Keyword extraction + signal boosts (`target_files` = 5, `context_files` = 3, recent git history = 2) rank project files; the top 8 are surfaced to the agent.
7. **Convention Confidence Gate** — Only conventions above a 0.5 confidence threshold are injected, so low-signal style rules don't override judgment.

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before opening a pull request.

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## License

© Muhammad Usman — [MIT License](LICENSE)

---
