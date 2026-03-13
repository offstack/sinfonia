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

Sinfonia needs to know which Linear team/project to monitor. First, see what's available:

```bash
npx sinfonia projects list
```

This prints all teams in your Linear workspace with their slug and workflow states:

```
  MYAPP  My Application
  States: Backlog, Todo, In Progress, Done

  INFRA  Infrastructure
  States: Triage, Todo, In Progress, Review, Done
```

Then pick the one Sinfonia should work on:

```bash
npx sinfonia projects use MYAPP
```

This updates `project_slug` in your `sinfonia.yaml`. You can switch projects at any time — restart Sinfonia for it to take effect.

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

## Dashboards

Sinfonia ships with **two dashboard options** — pick whichever fits your workflow:

| | TUI (Terminal) | Web (Browser) |
|---|---|---|
| **Launch** | `sinfonia start` (default) | `sinfonia start --web` |
| **Live stats** | ✅ Agents, tokens, runtime, retries | ✅ Agents, tokens, runtime, retries |
| **Running agents** | ✅ Table with events | ✅ Table with events + token breakdown |
| **Retry queue** | ✅ | ✅ |
| **Service info** | ✅ Webhook port, active scanners | ✅ Webhook URLs, integration port |
| **Configure scanners** | — | ✅ Toggle, include patterns, severity, thresholds |
| **Configure integrations** | — | ✅ Toggle, webhook URLs, secrets, auto-triage, filters |
| **Settings editor** | — | ✅ State flow, polling, max agents |
| **Switch projects** | — | ✅ Project selector with state list |

### TUI Dashboard (default)

The terminal dashboard runs out of the box — no browser needed. It refreshes every second with real-time agent activity displayed as human-readable events, plus service info at a glance:

```
 SINFONIA STATUS
  Agents: 2/5
  Runtime: 12m 34s
  Tokens: in 45K | out 12K | total 57K
  Completed: 3 issues
  Services: webhooks :3100
  Scanners: security, performance

  Running
  ID          STAGE         AGE / TURN   TOKENS       SESSION          EVENT
  * SIN-42    In Progress   3m 12s / 1   8K           a1b2...c3d4      Editing src/api/auth.ts
  * SIN-45    In Progress   1m 04s / 1   2K           e5f6...g7h8      Running: npm test
```

```bash
npx sinfonia start              # TUI is the default
```

### Web Dashboard

A full-featured browser dashboard with sidebar navigation, management controls, and settings. Launch it with `--web`:

```bash
npx sinfonia start --web
# ✦ Web dashboard: http://localhost:3200
```

**Pages:**

- **Overview** — Live stats cards, running agents table with real-time events, retry queue
- **Agents** — Detailed view with token breakdowns (in/out), session IDs, retry countdowns, completed list
- **Scanners** — Full setup per scanner: toggle on/off, include patterns, severity threshold, min duplicate lines, max complexity, prompt file. Each scanner gets a card with its own form.
- **Integrations** — Full setup per integration: toggle on/off, webhook URL shown for copy-paste, secret input, auto-triage mode, plus type-specific fields (min occurrences, ignored environments, event filters). Also includes a **Generic Webhook API** reference card with a ready-to-use `curl` example and field documentation.
- **Settings** — Configure state flow transitions, orchestrator settings (polling interval, max agents), switch Linear projects with available team states

All management actions write to `sinfonia.yaml` and are hot-reloaded automatically — no restart needed.

> **Tip:** Use the CLI for quick monitoring, and the web dashboard when you need to set up scanners, configure integrations, or tweak settings — no YAML editing required.

### Completion Comments

When an agent successfully completes an issue, Sinfonia posts a comment on Linear with:
- Branch name
- Clickable commit link (auto-detects GitHub/GitLab from git remote)
- Token usage breakdown (input/output)

### Configurable State Flow

Different teams have different Linear workflows. Configure `state_flow` to match yours:

```yaml
orchestrator:
  state_flow:
    on_dispatch: In Progress     # when agent starts working
    on_success: Ready for Review # when agent succeeds
    on_failure: Todo             # (optional) when max retries exhausted
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

Scanners use **Claude Code CLI** to analyze your codebase semantically — not just syntactically like traditional linters. Each scanner sends code chunks to Claude with a specialized prompt and collects structured findings.

| Scanner | What It Finds |
|---------|--------------|
| **security** | SQL injection, XSS, hardcoded secrets, SSRF, path traversal, insecure crypto |
| **performance** | N+1 queries, missing memoization, blocking operations, memory leaks, unnecessary re-renders |
| **dry** | Duplicated logic, copy-pasted functions, repeated error handling, repeated validation patterns |
| **simplify** | High complexity, deep nesting, dead code, long parameter lists, overly abstract code |
| **custom** | Anything — write your own prompt in a markdown file |

**How it works under the hood:**

1. Sinfonia collects files matching the module's `include`/`exclude` globs
2. Files are grouped into chunks (max 5000 lines) to fit Claude's context window
3. Each chunk is sent to `claude -p "analyze this code for..." --output-format json --max-turns 1`
4. Claude returns a JSON array of findings with file, line, severity, title, description
5. Findings are **deduplicated** against existing Linear issues (via fingerprint labels — no database needed)
6. New findings become Linear issues in the `Backlog` state with labels for tracing

**Triggering scanners:**

```bash
# Manually — run specific scanners
sinfonia scan -m security,performance

# Manually — scan specific files
sinfonia scan -m security -f "src/api/**/*.ts"

# Automatically — cron schedule (configured in sinfonia.yaml)
# Default: "0 2 * * *" (nightly at 2 AM)

# Automatically — on every git push (if on_push: true)
```

**Example finding created in Linear:**

```
Title:  [security] Hardcoded AWS secret key in deploy config
State:  Backlog
Labels: auto-detected, fp:a1b2c3d4e5f6g7h8, source:scanner:security, severity:high

Description:
  ## Security Finding
  **Severity:** high
  **File:** `src/config/deploy.ts:8`

  AWS_SECRET_ACCESS_KEY is hardcoded in the deployment configuration.
  This credential should be loaded from environment variables or a
  secrets manager to prevent exposure in version control.
```

**Deduplication:** Each finding gets a deterministic fingerprint (`sha256(type + file + title)`). This is stored as a `fp:xxxx` label on the Linear issue. On the next scan, Sinfonia checks for existing fingerprints and also does fuzzy title matching — so the same issue is never created twice. If a previous issue was marked Done and the same code problem reappears, it creates a new issue (regression).

### The Integrations

Integrations are **webhook receivers** — a Fastify HTTP server that accepts events from external services and converts them into Linear issues.

| Integration | Source | Webhook Endpoint | What It Captures |
|-------------|--------|-----------------|-----------------|
| **Sentry** | Runtime errors | `POST /webhooks/sentry` | Stack traces, breadcrumbs, occurrence count, environment |
| **GitHub** | Dependabot, CI | `POST /webhooks/github` | Dependency vulnerabilities (CVE), patched versions, CI check failures |
| **Generic** | Any webhook | `POST /webhooks/generic` | Any JSON payload with title/description/severity |

**How it works:**

1. External service sends a webhook POST to `http://your-server:3100/webhooks/{name}`
2. Sinfonia verifies the HMAC signature (prevents unauthorized requests)
3. Payload is transformed into a standardized `Finding` object
4. Finding is deduplicated against existing Linear issues
5. A new Linear issue is created with full context

**The `auto_triage` flag** controls where issues land:

- `auto_triage: false` (default) — Issues go to **Backlog**. A human reviews them and moves to Todo when ready to fix.
- `auto_triage: true` — Issues go directly to **Todo**. The orchestrator picks them up immediately and dispatches Claude Code to fix them.

> **Tip:** Use `auto_triage: true` for low-risk, high-confidence fixes (e.g., known dependency patches). Use `false` for production errors that need human judgment first.

---

#### Setting Up Sentry Integration

1. **In Sinfonia** — enable and set your secret:

```yaml
integrations:
  server_port: 3100
  sources:
    sentry:
      enabled: true
      secret: $SENTRY_WEBHOOK_SECRET    # env var or literal
      auto_triage: false                 # human review first
      min_occurrences: 5                 # ignore errors < 5 occurrences
      ignore_environments: [staging]     # skip staging errors
      ignore_patterns: []                # regex patterns to ignore
```

2. **In Sentry** — go to **Settings > Integrations > Webhooks** (or **Settings > Developer Settings > Webhooks**):
   - **Callback URL:** `http://your-server:3100/webhooks/sentry`
   - **Secret:** same value as `SENTRY_WEBHOOK_SECRET`
   - **Events:** check `issue` (triggers on new issues and regressions)

3. **Start Sinfonia** — the webhook server starts automatically:
```bash
sinfonia start
# Integration server listening on :3100
```

When Sentry fires a webhook, Sinfonia verifies the `sentry-hook-signature` header (HMAC-SHA256), extracts the error details (stack trace, breadcrumbs, occurrence count), and creates a Linear issue with full context.

#### Setting Up GitHub Integration

1. **In Sinfonia** — enable and set your secret:

```yaml
integrations:
  sources:
    github:
      enabled: true
      secret: $GITHUB_WEBHOOK_SECRET
      events:
        - dependabot_alert    # security vulnerabilities
```

2. **In GitHub** — go to your repo's **Settings > Webhooks > Add webhook**:
   - **Payload URL:** `http://your-server:3100/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** same value as `GITHUB_WEBHOOK_SECRET`
   - **Events:** select "Dependabot alerts" and/or "Check runs"

Sinfonia verifies the `x-hub-signature-256` header (HMAC-SHA256). For Dependabot alerts, it creates issues with CVE details, affected package, vulnerable version range, and fix version. For CI check failures, it creates issues with the check output and a link to GitHub.

#### Setting Up the Generic Webhook

The generic integration accepts **any JSON payload** — no signature verification required. Use it for internal tools, custom alerting systems, or services without built-in support.

```yaml
integrations:
  sources:
    generic:
      enabled: true
```

**Send a webhook:**

```bash
curl -X POST http://localhost:3100/webhooks/generic \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Memory usage exceeding 80% on prod-api-3",
    "description": "RSS has been above 80% for the last 15 minutes. Consider scaling or investigating leak.",
    "severity": "high",
    "file": "src/server.ts",
    "type": "performance"
  }'
```

**Accepted fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Issue title |
| `description` | string | No | Detailed description |
| `severity` | string | No | `critical`, `high`, `medium`, or `low` (default: `medium`) |
| `file` | string | No | Related file path |
| `line` | number | No | Line number |
| `type` | string | No | `security`, `performance`, `bug`, `simplify`, etc. (default: `bug`) |

---

#### Managing via Web Dashboard vs CLI

The **web dashboard** lets you fully configure scanners and integrations without touching YAML:

- **Scanners page** — toggle on/off, edit include patterns, severity thresholds, and module-specific settings (min duplicate lines, max complexity, prompt file)
- **Integrations page** — toggle on/off, view the webhook URL to configure in the external service, set the webhook secret, choose auto-triage mode, and configure filters (min occurrences, ignored environments, event types)

The **CLI** provides enable/disable commands:

```bash
sinfonia scanners enable security
sinfonia scanners disable dry
sinfonia integrations enable sentry
sinfonia integrations disable slack
```

Both the web dashboard and CLI write to `sinfonia.yaml`, which is hot-reloaded automatically.

> **Note:** After configuring an integration in the dashboard, you still need to point the external service (Sentry, GitHub, etc.) to the webhook URL shown on the Integrations page.

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
  state_flow:
    on_dispatch: In Progress
    on_success: Done
    # on_failure: Todo          # optional
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

# Projects
sinfonia projects list                          # List Linear teams/projects
sinfonia projects use <slug>                    # Switch Linear project

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
