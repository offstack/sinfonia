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
        `query($teamId: String!, $stateIds: [String!]!, $first: Int!, $after: String) {
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
      `mutation($id: String!, $stateId: String!) {
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
      `mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }`,
      { issueId, body },
    );
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    await this.ensureProjectContext();

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

    const data = await this.graphql<{
      issueCreate: {
        issue: LinearIssueNode;
      };
    }>(
      `mutation($teamId: String!, $title: String!, $description: String!, $priority: Int, $stateId: String) {
        issueCreate(input: {
          teamId: $teamId
          title: $title
          description: $description
          priority: $priority
          stateId: $stateId
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
    logger.info({ identifier: issue.identifier }, "created issue");
    return issue;
  }

  async searchIssues(query: string): Promise<Issue[]> {
    await this.ensureProjectContext();

    const data = await this.graphql<{
      searchIssues: { nodes: LinearIssueNode[] };
    }>(
      `query($teamId: String!, $query: String!) {
        searchIssues(filter: { team: { id: { eq: $teamId } } }, term: $query, first: 20) {
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

    return data.searchIssues.nodes.map((n) => this.toIssue(n));
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
