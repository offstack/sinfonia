import { describe, it, expect } from "vitest";
import { IntegrationRegistry } from "./registry.js";
import type { Integration } from "./sources/base.js";

function makeIntegration(name: string): Integration {
  return {
    name,
    description: `${name} integration`,
    verifySignature: () => true,
    transform: () => null,
    mapSeverity: () => "medium",
  };
}

describe("IntegrationRegistry", () => {
  it("has builtin integrations registered", () => {
    const registry = new IntegrationRegistry();
    const names = registry.names();
    expect(names).toContain("sentry");
    expect(names).toContain("github");
    expect(names).toContain("generic");
  });

  it("retrieves an integration by name", () => {
    const registry = new IntegrationRegistry();
    const integration = registry.get("sentry");
    expect(integration).toBeDefined();
    expect(integration!.name).toBe("sentry");
  });

  it("returns undefined for unknown integration", () => {
    const registry = new IntegrationRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("registers a custom integration", () => {
    const registry = new IntegrationRegistry();
    const custom = makeIntegration("pagerduty");
    registry.register(custom);
    expect(registry.get("pagerduty")).toBe(custom);
    expect(registry.names()).toContain("pagerduty");
  });

  it("overrides builtin integration when registering with same name", () => {
    const registry = new IntegrationRegistry();
    const override = makeIntegration("sentry");
    registry.register(override);
    expect(registry.get("sentry")).toBe(override);
  });

  it("lists all integrations", () => {
    const registry = new IntegrationRegistry();
    const integrations = registry.list();
    expect(integrations.length).toBe(3); // 3 builtins
    expect(integrations.every((i) => i.name && i.description)).toBe(true);
  });
});
