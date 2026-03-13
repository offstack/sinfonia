# Dashboards

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

## TUI Dashboard (default)

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

## Web Dashboard

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

## Completion Comments

When an agent successfully completes an issue, Sinfonia posts a comment on Linear with:
- Branch name
- Clickable commit link (auto-detects GitHub/GitLab from git remote)
- Token usage breakdown (input/output)

## Configurable State Flow

Different teams have different Linear workflows. Configure `state_flow` to match yours:

```yaml
orchestrator:
  state_flow:
    on_dispatch: In Progress     # when agent starts working
    on_success: Ready for Review # when agent succeeds
    on_failure: Todo             # (optional) when max retries exhausted
```
