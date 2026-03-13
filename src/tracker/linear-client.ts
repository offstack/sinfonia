import type { TrackerConfig } from "../config/schema.js";
import type { Issue } from "../shared/types.js";
import type {
  TrackerAdapter,
  CreateIssueInput,
  LinearGraphQLResponse,
  LinearIssueNode,
  LinearPageInfo,
  LinearTeam,
} from "./types.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("linear-client");
const LINEAR_API = "https://api.linear.app/graphql";
const PAGE_SIZE = 50;
const BATCH_SIZE = 50;

export class LinearClient implements TrackerAdapter {
  private apiKey: string;
  private projectSlug: string;
  private activeStates: string[];
  private projectId: string | null = null;
  private teamId: string | null = null;
  private stateIdCache = new Map<string, string>();

  constructor(config: TrackerConfig) {
    this.apiKey = config.api_key;
    this.projectSlug = config.project_slug;
    this.activeStates = config.active_states;
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Linear API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as LinearGraphQLResponse<T>;
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }
    return json.data as T;
  }

  private async ensureProjectContext(): Promise<void> {
    if (this.teamId && this.projectId) return;

    const data = await this.graphql<{
      teams: { nodes: Array<{ id: string; key: string; states: { nodes: Array<{ id: string; name: string }> } }> };
    }>(`query {
      teams {
        nodes {
          id
          key
          states { nodes { id name } }
        }
      }
    }`);

    const team = data.teams.nodes.find((t) => t.key === this.projectSlug);
    if (!team) {
      throw new Error(`Team with key "${this.projectSlug}" not found in Linear`);
    }

    this.teamId = team.id;
    for (const state of team.states.nodes) {
      this.stateIdCache.set(state.name.toLowerCase(), state.id);
    }

    logger.info({ teamId: this.teamId, states: team.states.nodes.length }, "resolved Linear team");
  }

  private resolveStateId(stateName: string): string | undefined {
    return this.stateIdCache.get(stateName.toLowerCase());
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    await this.ensureProjectContext();

    const stateIds = this.activeStates
      .map((s) => this.resolveStateId(s))
      .filter(Boolean) as string[];

    if (stateIds.length === 0) {
      logger.warn("no active states resolved to IDs");
      return [];
    }

    const issues: Issue[] = [];
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext) {
      type IssuesResponse = { issues: { nodes: LinearIssueNode[]; pageInfo: LinearPageInfo } };
      const data: IssuesResponse = await this.graphql<IssuesResponse>(
        `query($teamId: ID!, $stateIds: [ID!]!, $first: Int!, $after: String) {
          issues(
            filter: {
              team: { id: { eq: $teamId } }
              state: { id: { in: $stateIds } }
            }
            first: $first
            after: $after
            orderBy: createdAt
          ) {
            nodes {
              id identifier title description priority createdAt
              assignee { id }
              labels { nodes { name } }
              state { name }
              relations { nodes { type relatedIssue { id state { name } } } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { teamId: this.teamId, stateIds, first: PAGE_SIZE, after: cursor },
      );

      for (const node of data.issues.nodes) {
        issues.push(this.toIssue(node));
      }

      hasNext = data.issues.pageInfo.hasNextPage;
      cursor = data.issues.pageInfo.endCursor;
    }

    logger.info({ count: issues.length }, "fetched candidate issues");
    return issues;
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    // Batch into groups of BATCH_SIZE
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const data = await this.graphql<{
        issues: { nodes: Array<{ id: string; state: { name: string } }> };
      }>(
        `query($ids: [ID!]!) {
          issues(filter: { id: { in: $ids } }) {
            nodes { id state { name } }
          }
        }`,
        { ids: batch },
      );

      for (const node of data.issues.nodes) {
        result.set(node.id, node.state.name);
      }
    }

    return result;
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    await this.ensureProjectContext();
    const stateId = this.resolveStateId(stateName);
    if (!stateId) {
      throw new Error(`Unknown state "${stateName}" for team ${this.projectSlug}`);
    }

    await this.graphql(
      `mutation($id: ID!, $stateId: ID!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
        }
      }`,
      { id: issueId, stateId },
    );

    logger.info({ issueId, stateName }, "updated issue state");
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.graphql(
      `mutation($issueId: ID!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }`,
      { issueId, body },
    );
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    await this.ensureProjectContext();

    // Resolve label names to IDs (find existing or create new labels)
    let labelIds: string[] | undefined;
    if (input.labels && input.labels.length > 0) {
      labelIds = await this.resolveOrCreateLabelIds(input.labels);
    }

    const variables: Record<string, unknown> = {
      teamId: this.teamId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 3,
    };

    if (input.state) {
      const stateId = this.resolveStateId(input.state);
      if (stateId) variables.stateId = stateId;
    }

    if (labelIds && labelIds.length > 0) {
      variables.labelIds = labelIds;
    }

    const data = await this.graphql<{
      issueCreate: {
        issue: LinearIssueNode;
      };
    }>(
      `mutation($teamId: ID!, $title: String!, $description: String!, $priority: Int, $stateId: ID, $labelIds: [String!]) {
        issueCreate(input: {
          teamId: $teamId
          title: $title
          description: $description
          priority: $priority
          stateId: $stateId
          labelIds: $labelIds
        }) {
          issue {
            id identifier title description priority createdAt
            assignee { id }
            labels { nodes { name } }
            state { name }
            relations { nodes { type relatedIssue { id state { name } } } }
          }
        }
      }`,
      variables,
    );

    const issue = this.toIssue(data.issueCreate.issue);
    logger.info({ identifier: issue.identifier, labels: input.labels }, "created issue");
    return issue;
  }

  private async resolveOrCreateLabelIds(labelNames: string[]): Promise<string[]> {
    // Fetch existing labels for the team
    const data = await this.graphql<{
      issueLabels: { nodes: Array<{ id: string; name: string }> };
    }>(
      `query($teamId: ID) {
        issueLabels(filter: { team: { id: { eq: $teamId } } }, first: 250) {
          nodes { id name }
        }
      }`,
      { teamId: this.teamId },
    );

    const existingLabels = new Map(data.issueLabels.nodes.map((l) => [l.name, l.id]));
    const ids: string[] = [];

    for (const name of labelNames) {
      const existingId = existingLabels.get(name);
      if (existingId) {
        ids.push(existingId);
      } else {
        // Create the label
        try {
          const created = await this.graphql<{
            issueLabelCreate: { issueLabel: { id: string } };
          }>(
            `mutation($teamId: ID!, $name: String!) {
              issueLabelCreate(input: { teamId: $teamId, name: $name }) {
                issueLabel { id }
              }
            }`,
            { teamId: this.teamId, name },
          );
          ids.push(created.issueLabelCreate.issueLabel.id);
        } catch (err) {
          logger.warn({ label: name, err }, "failed to create label, skipping");
        }
      }
    }

    return ids;
  }

  async searchIssues(query: string): Promise<Issue[]> {
    await this.ensureProjectContext();

    const data = await this.graphql<{
      issueSearch: { nodes: LinearIssueNode[] };
    }>(
      `query($teamId: ID!, $query: String!) {
        issueSearch(filter: { team: { id: { eq: $teamId } } }, term: $query, first: 20) {
          nodes {
            id identifier title description priority createdAt
            assignee { id }
            labels { nodes { name } }
            state { name }
            relations { nodes { type relatedIssue { id state { name } } } }
          }
        }
      }`,
      { teamId: this.teamId, query },
    );

    return data.issueSearch.nodes.map((n) => this.toIssue(n));
  }

  async listTeams(): Promise<LinearTeam[]> {
    const data = await this.graphql<{
      teams: { nodes: Array<{ id: string; key: string; name: string; states: { nodes: Array<{ id: string; name: string }> } }> };
    }>(`query {
      teams {
        nodes {
          id
          key
          name
          states { nodes { id name } }
        }
      }
    }`);

    return data.teams.nodes.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      states: t.states.nodes,
    }));
  }

  private toIssue(node: LinearIssueNode): Issue {
    const blockerRelations = node.relations?.nodes?.filter((r) => r.type === "blocks") ?? [];
    return {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description ?? "",
      state: node.state.name,
      priority: node.priority,
      created_at: node.createdAt,
      assignee_id: node.assignee?.id,
      labels: node.labels?.nodes?.map((l) => l.name) ?? [],
      blockers: blockerRelations.map((r) => r.relatedIssue.id),
    };
  }
}
