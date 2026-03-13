# Integration Setup Guides

## Setting Up Sentry Integration

1. **In Sinfonia** — enable and set your secret (via web dashboard or YAML):

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

## Setting Up GitHub Integration

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

## Setting Up the Generic Webhook

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

## Managing via Web Dashboard vs CLI

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
