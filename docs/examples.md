# Example Use Cases

## 1. Autonomous Bug Fixing

Your team uses Linear to track bugs. Move an issue to "Todo" and Sinfonia picks it up:

```
Linear: BUG-42 "Login fails when email has + character"
  → Sinfonia detects it (polling)
  → Creates worktree, spawns Claude Code
  → Claude reads codebase, finds the regex bug, fixes it, adds a test
  → Pushes branch, creates PR
  → Team reviews and merges
```

## 2. Sentry Error → Auto-Fix Pipeline

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

## 3. Nightly Security Audit

Enable the security scanner with a nightly schedule:

```
2:00 AM: Scanner analyzes entire codebase
  → Finds: SQL injection in api/search.ts:23
  → Finds: Hardcoded AWS key in config/deploy.ts:8
  → Creates 2 Linear issues in Backlog with details
  → Next morning: team reviews, moves critical ones to Todo
  → Sinfonia fixes them during the day
```

## 4. Continuous Code Quality

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

## 5. Custom Code Review Checklist

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

## 6. Dependency Vulnerability Auto-Patching

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
