# Configuration

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
