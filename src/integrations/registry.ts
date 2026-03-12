import type { Integration } from "./sources/base.js";
import { sentryIntegration } from "./sources/sentry.js";
import { githubIntegration } from "./sources/github.js";
import { genericIntegration } from "./sources/generic.js";

const builtinIntegrations = new Map<string, Integration>([
  ["sentry", sentryIntegration],
  ["github", githubIntegration],
  ["generic", genericIntegration],
]);

export class IntegrationRegistry {
  private integrations = new Map<string, Integration>(builtinIntegrations);

  register(integration: Integration): void {
    this.integrations.set(integration.name, integration);
  }

  get(name: string): Integration | undefined {
    return this.integrations.get(name);
  }

  list(): Integration[] {
    return Array.from(this.integrations.values());
  }

  names(): string[] {
    return Array.from(this.integrations.keys());
  }
}
