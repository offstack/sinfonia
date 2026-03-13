# Sinfonia

Autonomous code improvement pipeline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Inspired by OpenAI's [Symphony](https://github.com/openai/symphony), rebuilt from the ground up for Claude.

Sinfonia monitors your Linear board, automatically picks up issues, spawns Claude Code agents to fix them, and delivers pull requests — all without human supervision. It also proactively scans your codebase for security vulnerabilities, performance issues, code duplication, and complexity, creating Linear issues automatically. External services like Sentry and GitHub can feed errors and alerts directly into the pipeline.

```
     INTEGRATIONS (reactive)          SCANNERS (proactive)
  Sentry, GitHub, Slack webhooks    security, perf, DRY, simplify
              │                              │
              └──────────┬───────────────────┘
                         ▼
               ┌───────────────────┐
               │   Dedup + Enrich  │
               └────────┬──────────┘
                        ▼
                ┌──────────────┐
                │ Linear Board │
                │  Backlog → Todo → In Progress → Done
                └───────┬──────┘
                        ▼
              ORCHESTRATOR (executor)
           watches Todo, dispatches Claude Code,
              delivers PRs, handles rework
```

## Requirements

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- A [Linear](https://linear.app) account with an API key
- Git (for worktree-based workspace isolation)

## Quick Start

### 1. Install

```bash
git clone <repo-url> && cd sinfonia
npm install
npm run build
```

### 2. Initialize Config

```bash
npx sinfonia init --project my-app --slug MYAPP
```

This creates `sinfonia.yaml`. Edit it to set your prompt template and preferences.

### 3. Set Environment Variables

```bash
export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
```

### 4. Choose Your Linear Project

```bash
npx sinfonia projects list      # See available teams
npx sinfonia projects use MYAPP # Pick one
```

### 5. Start

```bash
# Terminal dashboard (default)
npx sinfonia start

# Browser dashboard at http://localhost:3200
npx sinfonia start --web
```

You can also run subsets of the pipeline:

```bash
npx sinfonia start --orchestrator-only   # Only fix issues from Linear
npx sinfonia start --scanners-only       # Only find issues, don't fix them
```

## Documentation

- **[Dashboards](docs/dashboards.md)** — TUI vs Web dashboard comparison, completion comments, configurable state flow
- **[How It Works](docs/how-it-works.md)** — Orchestrator polling/dispatch cycle, scanner pipeline, integration webhook receivers
- **[Integration Setup](docs/integrations-setup.md)** — Step-by-step guides for Sentry, GitHub, and Generic webhooks
- **[Configuration](docs/configuration.md)** — Full `sinfonia.yaml` reference with all sections
- **[CLI Reference](docs/cli-reference.md)** — All commands: start, scan, status, dispatch, scanners, integrations, projects
- **[Examples](docs/examples.md)** — Use cases: auto bug fixing, Sentry→fix pipeline, nightly audits, code quality, custom checks

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Run with tsx (no build needed)
npm test             # Run tests
npm run lint         # Type-check
```

## License

Apache 2.0
