# Promptly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6)](https://modelcontextprotocol.io)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-F97316?logo=anthropic&logoColor=white)](https://claude.ai)
[![Cursor](https://img.shields.io/badge/Cursor-Ready-00D1FF?logo=cursor&logoColor=white)](https://cursor.com)
[![npm](https://img.shields.io/badge/npm-promptly--ai-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/promptly-ai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Better prompts. Better code. First time.**

Promptly is an MCP server that analyzes your codebase and refines your coding prompts before your AI agent acts on them. No extra API key. No separate model. Zero friction.

> The intelligence is Claude (or your agent). Promptly is the context it was missing.

---

## How It Works

```
You type a prompt
       ↓
Claude calls Promptly's MCP tools
       ↓
Promptly scans your project (stack, conventions, structure, deps)
       ↓
Promptly refines your prompt with real codebase context
       ↓
Claude executes the refined, context-aware version
```

No external API call. No latency from a second model. Your agent just becomes more accurate when Promptly is connected.

---

## Features

| Feature | What It Does |
|---------|-------------|
| **Stack Detection** | Reads `package.json`, `tsconfig.json`, `go.mod`, `Cargo.toml`, etc. Detects framework, language, styling, ORM, package manager, runtime |
| **Convention Analysis** | Samples your code to detect naming conventions, file naming, export style, quotes, semicolons, indentation, test patterns |
| **Structure Mapping** | Maps your project tree, identifies key directories (components, hooks, utils, api, etc.) |
| **Dependency Awareness** | Categorizes all dependencies by purpose — UI, state, testing, build, HTTP, database, auth |
| **Prompt Refinement** | Applies agent-specific rules using real codebase context to produce better prompts |

---

## Quick Start

```bash
npm install -g promptly-ai
promptly init
```

That's it. Restart Claude Code and Promptly is active.

---

## CLI Commands

```bash
promptly init          # Set up Promptly for Claude Code
promptly mcp           # Start MCP server (called by Claude Code automatically)
promptly status        # Check if Promptly is configured
promptly rules [agent] # Print refinement rules (claude_code|cursor|gemini_cli|generic)
promptly --version     # Print version
```

---

## MCP Tools

Promptly exposes 3 tools via MCP:

### `analyze_codebase`

Scans your project and returns structured context:

```json
{
  "stack": {
    "language": "TypeScript",
    "framework": "Next.js 14.1.0",
    "styling": "Tailwind CSS",
    "orm": "Prisma",
    "packageManager": "pnpm",
    "testRunner": "Vitest"
  },
  "conventions": {
    "namingConvention": "camelCase",
    "fileNaming": "kebab-case",
    "exportStyle": "named",
    "quotes": "single",
    "semicolons": false
  },
  "structure": {
    "keyDirs": {
      "src/components": "UI components",
      "src/hooks": "Custom hooks",
      "src/lib": "Library/shared code"
    }
  },
  "dependencies": {
    "categories": {
      "UI Framework": ["react"],
      "State": ["zustand"],
      "Testing": ["vitest", "@testing-library/react"]
    }
  }
}
```

### `refine_prompt`

Takes your raw prompt + codebase context, returns a refined version with rules applied.

### `get_refinement_rules`

Returns the current ruleset for transparency.

---

## Supported Agents

| Agent | Rules | Codebase Analysis |
|-------|-------|-------------------|
| **Claude Code** | Full agent-specific rules | Full |
| **Cursor** | Full agent-specific rules | Full |
| **Gemini CLI** | Full agent-specific rules | Full |

---

## Architecture

```
promptly/
├── packages/
│   ├── rules/   # @promptly/rules — shared refinement rules
│   └── cli/     # promptly-ai — npm package + local MCP server + codebase analyzer
├── package.json
└── tsconfig.base.json
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
node packages/cli/dist/bin/promptly.js --help
node packages/cli/dist/bin/promptly.js rules claude_code
```

---

## How Refinement Works

Promptly applies rules in sequence, each one enriching the prompt:

1. **Specificity** — Adds concrete tech stack context
2. **File Scope** — References project structure and key directories
3. **Conventions** — Enforces detected code style (naming, quotes, exports)
4. **Constraints** — Adds guardrails (no unnecessary packages, preserve patterns)
5. **Success Criteria** — Defines verification steps
6. **Agent-Specific** — Imperative mood, numbered steps, test reminders (varies by agent)

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

---

## License

© Muhammad Usman — [MIT License](LICENSE)

---
