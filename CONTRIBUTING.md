# Contributing to Promptly

Thanks for your interest in contributing to Promptly! Every contribution matters, whether it's a bug report, feature request, or code change.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/promptly.git
   cd promptly
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Project Structure

```
promptly/
├── packages/
│   ├── rules/   # @promptly/rules — shared refinement rules
│   └── cli/     # promptly-ai — npm package + local MCP server + codebase analyzer
```

- **`packages/rules/`** — Pure TypeScript, no deps. Contains all refinement rules organized by agent (Claude Code, Cursor, Gemini CLI).
- **`packages/cli/`** — The CLI tool and local MCP server. Contains the codebase analyzer (stack detection, convention analysis, structure mapping, dependency awareness).

## Development Workflow

1. Create a branch for your change:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes

3. Build and test:
   ```bash
   npm run build
   node packages/cli/dist/bin/promptly.js --help
   node packages/cli/dist/bin/promptly.js rules claude_code
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: description of your change"
   ```

5. Push and open a pull request:
   ```bash
   git push origin feat/your-feature
   ```

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `chore:` — Maintenance tasks

## What to Contribute

### Adding New Rules

Rules live in `packages/rules/src/`. Each agent has its own file:

- `universal.ts` — Rules applied to all agents
- `claude-code.ts` — Claude Code specific
- `cursor.ts` — Cursor specific
- `gemini.ts` — Gemini CLI specific

A rule implements the `Rule` interface:

```typescript
{
  name: "rule_name",
  description: "What this rule does",
  apply: (prompt, context) => {
    // Transform the prompt using codebase context
    return refinedPrompt;
  }
}
```

### Improving the Analyzer

The codebase analyzer lives in `packages/cli/src/analyzer/`:

- `stack.ts` — Tech stack detection (add new frameworks, languages, tools)
- `conventions.ts` — Code convention analysis (improve detection accuracy)
- `structure.ts` — File structure mapping (add new key directory patterns)
- `dependencies.ts` — Dependency categorization (add new package categories)

### Adding Agent Support

To add a new agent:

1. Create `packages/rules/src/new-agent.ts`
2. Export the rules array
3. Add the agent to `packages/rules/src/index.ts`
4. Update the `Agent` type union

## Reporting Bugs

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, agent)

## Suggesting Features

Open an issue with:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code of Conduct

Be respectful and constructive. We're all here to make AI coding better.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
