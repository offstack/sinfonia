# CLI Reference

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
