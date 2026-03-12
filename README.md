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

### 4. Start

```bash
# Full pipeline (orchestrator + scanners + integrations)
npx sinfonia start

# Just the orchestrator (fix issues from Linear)
npx sinfonia start --orchestrator-only

# Just the scanners (find issues, don't fix them)
npx sinfonia start --scanners-only

# With web dashboard instead of TUI
npx sinfonia start --web
```

## How It Works

### The Orchestrator

1. **Polls Linear** every 30 seconds for issues in active states (Todo, In Progress, Rework)
2. **Claims** eligible issues respecting concurrency limits (global + per-state)
3. **Creates isolated workspaces** using git worktrees — each issue gets its own branch
4. **Spawns Claude Code** as a subprocess with the rendered prompt
5. **Monitors** the agent for completion, stalls, or timeouts
6. **Retries** on failure with exponential backoff, or schedules continuation checks on success
7. **Reconciles** periodically — detects issues that moved to terminal states, cleans up

No persistent database. State recovers from Linear + filesystem on restart.

### The Scanners

Automated code analysis that creates Linear issues:

| Scanner | What It Finds |
|---------|--------------|
| **security** | SQL injection, XSS, hardcoded secrets, SSRF, path traversal |
| **performance** | N+1 queries, missing memoization, blocking operations, memory leaks |
| **dry** | Duplicated logic, copy-pasted functions, repeated patterns |
| **simplify** | High complexity, deep nesting, dead code, long parameter lists |
| **custom** | Anything — write your own prompt in a markdown file |

Scanners use Claude to analyze code semantically, not just syntactically. They find issues that traditional linters miss.

### The Integrations

Webhook receivers that turn external events into Linear issues:

| Integration | Source | What It Captures |
|-------------|--------|-----------------|
| **Sentry** | Runtime errors | Stack traces, breadcrumbs, occurrence count, environment |
| **GitHub** | Dependabot, CI | Vulnerability details, patched versions, check run failures |
| **Generic** | Any webhook | Accepts any JSON payload with title/description/severity |

Each integration has an `auto_triage` flag — when enabled, issues go directly to Todo (and Sinfonia fixes them immediately). When disabled, they go to Backlog for human review first.

## Configuration

Sinfonia uses a single `sinfonia.yaml` file with hot-reload:

```yaml
project:
  name: my-app
  repo: ./

tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: MYAPP
  active_states: [Todo, "In Progress", Rework]

orchestrator:
  polling_interval_ms: 30000
  max_concurrent_agents: 5
  max_concurrent_by_state:
    todo: 3
    rework: 2
  retry:
    max_backoff_ms: 300000

workspace:
  root: ./.sinfonia/workspaces
  strategy: worktree

agent:
  command: claude
  allowed_tools: [Bash, Read, Write, Edit, Glob, Grep]
  max_turns: 30
  turn_timeout_ms: 900000     # 15 minutes
  stall_timeout_ms: 120000    # 2 minutes

prompt: |
  You are working on issue {{issue.identifier}}: {{issue.title}}

  ## Description
  {{issue.description}}

  ## Instructions
  1. Work in the current directory (an isolated git worktree)
  2. Understand the codebase before making changes
  3. Implement the fix or feature described above
  4. Write or update tests as needed
  5. Commit your changes with a descriptive message
  6. Push your branch and create a PR

scanners:
  schedule: "0 2 * * *"       # Run nightly at 2am
  on_push: false
  modules:
    security:
      enabled: true
      include: ["src/**/*.ts"]
    performance:
      enabled: true
    dry:
      enabled: false
    simplify:
      enabled: false
    custom:
      enabled: false
      prompt_file: ./my-scan.md
  linear:
    target_state: Backlog
    labels: [auto-detected]
    dedup: true

integrations:
  server_port: 3100
  sources:
    sentry:
      enabled: true
      secret: $SENTRY_WEBHOOK_SECRET
      auto_triage: false
      min_occurrences: 5
    github:
      enabled: true
      secret: $GITHUB_WEBHOOK_SECRET
      events: [dependabot_alert]

dashboard:
  tui: true
  web: false
  web_port: 3200
```

Config changes are picked up automatically — no restart needed.

## CLI Reference

```bash
# Lifecycle
sinfonia init [--project name] [--slug SLUG]   # Create sinfonia.yaml
sinfonia start [options]                        # Start the pipeline
  --orchestrator-only                           #   Only fix issues
  --scanners-only                               #   Only find issues
  --web                                         #   Web dashboard instead of TUI
  -c, --config <path>                           #   Custom config path

# Scanners
sinfonia scan                                   # Run all enabled scanners
sinfonia scan --modules security,performance    # Run specific scanners
sinfonia scan --files "src/api/**/*.ts"         # Scan specific files
sinfonia scanners list                          # Show scanner status
sinfonia scanners enable <name>                 # Enable a scanner
sinfonia scanners disable <name>                # Disable a scanner

# Integrations
sinfonia integrations list                      # Show integration status
sinfonia integrations enable <name>             # Enable an integration
sinfonia integrations disable <name>            # Disable an integration

# Operations
sinfonia status                                 # TUI dashboard
sinfonia status --web                           # Web dashboard
sinfonia dispatch <issue-id>                    # Force-dispatch an issue
sinfonia retry <issue-id>                       # Retry a failed issue
sinfonia refresh                                # Trigger immediate poll
```

## Example Use Cases

### 1. Autonomous Bug Fixing

Your team uses Linear to track bugs. Move an issue to "Todo" and Sinfonia picks it up:

```
Linear: BUG-42 "Login fails when email has + character"
  → Sinfonia detects it (polling)
  → Creates worktree, spawns Claude Code
  → Claude reads codebase, finds the regex bug, fixes it, adds a test
  → Pushes branch, creates PR
  → Team reviews and merges
```

### 2. Sentry Error → Auto-Fix Pipeline

Connect Sentry to Sinfonia's webhook endpoint:

```
Production: TypeError at api/users.ts:45
  → Sentry groups the error, fires webhook
  → Sinfonia creates Linear issue in Backlog with stack trace
  → Team triages: moves to Todo
  → Sinfonia fixes it with full error context
  → PR submitted with the fix
```

With `auto_triage: true`, skip the human step — Sentry errors go directly to Todo.

### 3. Nightly Security Audit

Enable the security scanner with a nightly schedule:

```
2:00 AM: Scanner analyzes entire codebase
  → Finds: SQL injection in api/search.ts:23
  → Finds: Hardcoded AWS key in config/deploy.ts:8
  → Creates 2 Linear issues in Backlog with details
  → Next morning: team reviews, moves critical ones to Todo
  → Sinfonia fixes them during the day
```

### 4. Continuous Code Quality

Enable performance + DRY scanners on git push:

```yaml
scanners:
  on_push: true
  modules:
    performance:
      enabled: true
    dry:
      enabled: true
      min_duplicate_lines: 10
```

```
Developer pushes to main
  → Scanners analyze changed files
  → Finds: N+1 query in new endpoint
  → Finds: Validation logic duplicated from another form
  → Creates Backlog issues with explanations
  → Team decides which to auto-fix
```

### 5. Custom Code Review Checklist

Create `my-scan.md` with your team's specific patterns:

```markdown
Check this code for our team's conventions:
- API endpoints must validate request body with Zod
- Database queries must use the query builder, not raw SQL
- Error responses must use our standard ErrorResponse format
- Async functions must have try/catch with proper logging
```

```yaml
scanners:
  modules:
    custom:
      enabled: true
      prompt_file: ./my-scan.md
```

Now your team's conventions are automatically enforced.

### 6. Dependency Vulnerability Auto-Patching

Connect GitHub Dependabot webhooks:

```
Dependabot: lodash 4.17.20 has prototype pollution vulnerability
  → GitHub sends webhook to Sinfonia
  → Sinfonia creates Linear issue with CVE details and fix version
  → With auto_triage, it immediately:
    - Creates worktree
    - Runs `npm update lodash`
    - Verifies tests pass
    - Creates PR
```

## Architecture

```
sinfonia/
├── src/
│   ├── config/           # Zod schema, YAML loader, hot-reload watcher
│   ├── tracker/          # Linear GraphQL client (pagination, batching)
│   ├── workspace/        # Git worktrees, path sanitization, lifecycle hooks
│   ├── agent/            # Claude Code CLI subprocess, session management
│   ├── orchestrator/     # Polling, dispatch, reconciliation, retry queue
│   ├── scanners/         # Plugin registry, cron scheduler, 5 modules
│   ├── integrations/     # Webhook server, Sentry/GitHub/generic handlers
│   ├── dashboard/        # TUI (ANSI) + Web (Fastify REST API)
│   └── shared/           # Structured logging, type definitions
├── sinfonia.example.yaml # Template config
├── package.json
└── tsconfig.json
```

### Key Design Decisions

- **Claude Code CLI, not JSON-RPC** — `claude -p "prompt" --output-format json` is simpler than implementing Codex's app-server protocol
- **Git worktrees, not clones** — instant, shared `.git` objects, minimal disk
- **No database** — state recovers from Linear + filesystem (same as Symphony)
- **Single config file** — `sinfonia.yaml` with hot-reload
- **Plugin architecture** — add custom scanners or integrations by implementing a simple interface
- **Fingerprint-based deduplication** — prevents duplicate Linear issues across all sources

### How It Differs From Symphony

| Aspect | Symphony (OpenAI) | Sinfonia |
|--------|-------------------|----------|
| Agent | Codex (JSON-RPC protocol) | Claude Code (CLI) |
| Language | Elixir | TypeScript |
| Scope | Orchestrator only | Orchestrator + Scanners + Integrations |
| Scanners | None | 5 built-in + custom |
| External integrations | None | Sentry, GitHub, Slack, generic |
| Config management | CLI toggle + YAML + web dashboard | CLI toggle + YAML + web dashboard |
| Dashboard | Phoenix LiveView TUI | ANSI TUI + REST API |

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
