# How It Works

## The Orchestrator

1. **Polls Linear** every 30 seconds for issues in active states (Todo, In Progress, Rework)
2. **Claims** eligible issues respecting concurrency limits (global + per-state)
3. **Creates isolated workspaces** using git worktrees — each issue gets its own branch
4. **Spawns Claude Code** as a subprocess with the rendered prompt
5. **Monitors** the agent for completion, stalls, or timeouts
6. **Retries** on failure with exponential backoff, or schedules continuation checks on success
7. **Reconciles** periodically — detects issues that moved to terminal states, cleans up

No persistent database. State recovers from Linear + filesystem on restart.

## The Scanners

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

## The Integrations

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
