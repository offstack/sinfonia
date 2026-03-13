import { z } from "zod";

const trackerSchema = z.object({
  kind: z.enum(["linear"]),
  api_key: z.string().min(1),
  project_slug: z.string().min(1),
  active_states: z.array(z.string()).default(["Todo", "In Progress", "Rework"]),
  assignee: z.string().optional(),
});

const stateFlowSchema = z.object({
  on_dispatch: z.string().default("In Progress"),
  on_success: z.string().default("Done"),
  on_failure: z.string().optional(),
}).default({});

const orchestratorSchema = z.object({
  polling_interval_ms: z.number().int().positive().default(30000),
  max_concurrent_agents: z.number().int().positive().default(5),
  max_concurrent_by_state: z.record(z.string(), z.number().int().positive()).default({}),
  done_state: z.string().default("Done"), // legacy — use state_flow instead
  state_flow: stateFlowSchema,
  retry: z.object({
    max_backoff_ms: z.number().int().positive().default(300000),
  }).default({}),
});

const workspaceSchema = z.object({
  root: z.string().default("./.sinfonia/workspaces"),
  strategy: z.enum(["worktree", "clone", "directory"]).default("worktree"),
  hooks: z.object({
    after_create: z.string().default(""),
    before_run: z.string().default(""),
    after_run: z.string().default(""),
    before_remove: z.string().default(""),
  }).default({}),
  hooks_timeout_ms: z.number().int().positive().default(60000),
});

const agentSchema = z.object({
  command: z.string().default("claude"),
  allowed_tools: z.array(z.string()).default(["Bash", "Read", "Write", "Edit", "Glob", "Grep"]),
  max_turns: z.number().int().positive().default(30),
  turn_timeout_ms: z.number().int().positive().default(900000),
  stall_timeout_ms: z.number().int().positive().default(120000),
});

const scannerModuleSchema = z.object({
  enabled: z.boolean().default(false),
  severity_threshold: z.enum(["critical", "high", "medium", "low"]).optional(),
  include: z.array(z.string()).default(["src/**/*.ts"]),
  exclude: z.array(z.string()).default([]),
  min_duplicate_lines: z.number().int().positive().optional(),
  max_complexity: z.number().int().positive().optional(),
  prompt_file: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

const scannersSchema = z.object({
  schedule: z.string().default("0 2 * * *"),
  on_push: z.boolean().default(false),
  modules: z.record(z.string(), scannerModuleSchema).default({}),
  linear: z.object({
    target_state: z.string().default("Backlog"),
    labels: z.array(z.string()).default(["auto-detected"]),
    dedup: z.boolean().default(true),
  }).default({}),
});

const integrationSourceSchema = z.object({
  enabled: z.boolean().default(false),
  secret: z.string().default(""),
  auto_triage: z.boolean().default(false),
  min_occurrences: z.number().int().nonnegative().optional(),
  ignore_environments: z.array(z.string()).default([]),
  ignore_patterns: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  channel: z.string().optional(),
  trigger_emoji: z.string().optional(),
  signing_secret: z.string().optional(),
});

const integrationsSchema = z.object({
  server_port: z.number().int().positive().default(3100),
  sources: z.record(z.string(), integrationSourceSchema).default({}),
});

const dashboardSchema = z.object({
  tui: z.boolean().default(true),
  web: z.boolean().default(false),
  web_port: z.number().int().positive().default(3200),
});

export const sinfoniaConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    repo: z.string().default("./"),
  }),
  tracker: trackerSchema,
  orchestrator: orchestratorSchema.default({}),
  workspace: workspaceSchema.default({}),
  agent: agentSchema.default({}),
  prompt: z.string().default(""),
  scanners: scannersSchema.default({}),
  integrations: integrationsSchema.default({}),
  dashboard: dashboardSchema.default({}),
});

export type SinfoniaConfig = z.infer<typeof sinfoniaConfigSchema>;
export type TrackerConfig = z.infer<typeof trackerSchema>;
export type OrchestratorConfig = z.infer<typeof orchestratorSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceSchema>;
export type AgentConfig = z.infer<typeof agentSchema>;
export type ScannersConfig = z.infer<typeof scannersSchema>;
export type ScannerModuleConfig = z.infer<typeof scannerModuleSchema>;
export type IntegrationsConfig = z.infer<typeof integrationsSchema>;
export type IntegrationSourceConfig = z.infer<typeof integrationSourceSchema>;
export type StateFlowConfig = z.infer<typeof stateFlowSchema>;
export type DashboardConfig = z.infer<typeof dashboardSchema>;
