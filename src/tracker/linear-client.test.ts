import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinearClient } from "./linear-client.js";
import type { TrackerConfig } from "../config/schema.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeConfig(overrides: Partial<TrackerConfig> = {}): TrackerConfig {
  return {
    kind: "linear",
    api_key: "test-api-key",
    project_slug: "SIN",
    active_states: ["Todo", "In Progress"],
    ...overrides,
  };
}

const TEAM_RESPONSE = {
  data: {
    teams: {
      nodes: [
        {
          id: "team-1",
          key: "SIN",
          name: "Sinfonia",
          states: {
            nodes: [
              { id: "state-todo", name: "Todo" },
              { id: "state-ip", name: "In Progress" },
              { id: "state-done", name: "Done" },
            ],
          },
        },
      ],
    },
  },
};

function makeIssueNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    identifier: "SIN-1",
    title: "Test issue",
    description: "A test issue",
    priority: 2,
    createdAt: "2025-01-01T00:00:00Z",
    assignee: null,
    labels: { nodes: [{ name: "bug" }] },
    state: { name: "Todo" },
    relations: { nodes: [] },
    ...overrides,
  };
}

describe("LinearClient", () => {
  let client: LinearClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new LinearClient(makeConfig());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  function mockFetchResponses(...responses: object[]) {
    for (const resp of responses) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(resp),
      });
    }
  }

  describe("fetchCandidateIssues", () => {
    it("fetches issues from active states with pagination", async () => {
      mockFetchResponses(TEAM_RESPONSE, {
        data: {
          issues: {
            nodes: [makeIssueNode()],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const issues = await client.fetchCandidateIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        id: "issue-1",
        identifier: "SIN-1",
        title: "Test issue",
        description: "A test issue",
        state: "Todo",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        assignee_id: undefined,
        labels: ["bug"],
        blockers: [],
      });
    });

    it("returns empty array when no active states resolve", async () => {
      const clientNoStates = new LinearClient(
        makeConfig({ active_states: ["Nonexistent"] }),
      );
      mockFetchResponses(TEAM_RESPONSE);

      const issues = await clientNoStates.fetchCandidateIssues();
      expect(issues).toEqual([]);
    });

    it("paginates through multiple pages", async () => {
      mockFetchResponses(TEAM_RESPONSE, {
        data: {
          issues: {
            nodes: [makeIssueNode({ id: "issue-1" })],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      }, {
        data: {
          issues: {
            nodes: [makeIssueNode({ id: "issue-2", identifier: "SIN-2" })],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const issues = await client.fetchCandidateIssues();
      expect(issues).toHaveLength(2);
      expect(issues[0].id).toBe("issue-1");
      expect(issues[1].id).toBe("issue-2");
    });
  });

  describe("updateIssueState", () => {
    it("sends mutation with resolved state ID", async () => {
      mockFetchResponses(TEAM_RESPONSE, { data: { issueUpdate: { success: true } } });

      await client.updateIssueState("issue-1", "Done");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws for unknown state", async () => {
      mockFetchResponses(TEAM_RESPONSE);

      await expect(client.updateIssueState("issue-1", "Nonexistent")).rejects.toThrow(
        'Unknown state "Nonexistent"',
      );
    });
  });

  describe("createIssue", () => {
    it("creates an issue and returns mapped result", async () => {
      const node = makeIssueNode({ identifier: "SIN-99" });
      mockFetchResponses(TEAM_RESPONSE, {
        data: { issueCreate: { issue: node } },
      });

      const issue = await client.createIssue({
        title: "New issue",
        description: "Description",
        priority: 1,
      });
      expect(issue.identifier).toBe("SIN-99");
    });

    it("includes state ID when state is provided", async () => {
      mockFetchResponses(TEAM_RESPONSE, {
        data: { issueCreate: { issue: makeIssueNode() } },
      });

      await client.createIssue({
        title: "Test",
        description: "desc",
        state: "Todo",
      });

      // Verify second fetch call includes stateId variable
      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.variables.stateId).toBe("state-todo");
    });
  });

  describe("fetchIssueStatesByIds", () => {
    it("returns map of issue ID to state name", async () => {
      mockFetchResponses({
        data: {
          issues: {
            nodes: [
              { id: "id-1", state: { name: "Done" } },
              { id: "id-2", state: { name: "Todo" } },
            ],
          },
        },
      });

      const result = await client.fetchIssueStatesByIds(["id-1", "id-2"]);
      expect(result.get("id-1")).toBe("Done");
      expect(result.get("id-2")).toBe("Todo");
    });
  });

  describe("createComment", () => {
    it("sends comment mutation", async () => {
      mockFetchResponses({ data: { commentCreate: { success: true } } });

      await client.createComment("issue-1", "Hello world");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.variables.issueId).toBe("issue-1");
      expect(body.variables.body).toBe("Hello world");
    });
  });

  describe("searchIssues", () => {
    it("returns matching issues", async () => {
      mockFetchResponses(TEAM_RESPONSE, {
        data: {
          searchIssues: { nodes: [makeIssueNode()] },
        },
      });

      const results = await client.searchIssues("test query");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Test issue");
    });
  });

  describe("listTeams", () => {
    it("returns formatted team list", async () => {
      mockFetchResponses({
        data: {
          teams: {
            nodes: [
              {
                id: "team-1",
                key: "SIN",
                name: "Sinfonia",
                states: { nodes: [{ id: "s1", name: "Todo" }] },
              },
            ],
          },
        },
      });

      const teams = await client.listTeams();
      expect(teams).toEqual([
        {
          id: "team-1",
          key: "SIN",
          name: "Sinfonia",
          states: [{ id: "s1", name: "Todo" }],
        },
      ]);
    });
  });

  describe("error handling", () => {
    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(client.listTeams()).rejects.toThrow("Linear API error 401");
    });

    it("throws on GraphQL error", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ errors: [{ message: "Invalid query" }] }),
      });

      await expect(client.listTeams()).rejects.toThrow(
        "Linear GraphQL error: Invalid query",
      );
    });

    it("throws when team not found", async () => {
      const clientBadSlug = new LinearClient(
        makeConfig({ project_slug: "NOPE" }),
      );
      mockFetchResponses(TEAM_RESPONSE);

      await expect(clientBadSlug.fetchCandidateIssues()).rejects.toThrow(
        'Team with key "NOPE" not found',
      );
    });
  });

  describe("toIssue mapping", () => {
    it("maps blocker relations correctly", async () => {
      const node = makeIssueNode({
        relations: {
          nodes: [
            { type: "blocks", relatedIssue: { id: "blocker-1", state: { name: "Todo" } } },
            { type: "related", relatedIssue: { id: "related-1", state: { name: "Todo" } } },
          ],
        },
      });
      mockFetchResponses(TEAM_RESPONSE, {
        data: {
          issues: {
            nodes: [node],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const issues = await client.fetchCandidateIssues();
      expect(issues[0].blockers).toEqual(["blocker-1"]);
    });

    it("maps assignee_id when present", async () => {
      const node = makeIssueNode({ assignee: { id: "user-1" } });
      mockFetchResponses(TEAM_RESPONSE, {
        data: {
          issues: {
            nodes: [node],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

      const issues = await client.fetchCandidateIssues();
      expect(issues[0].assignee_id).toBe("user-1");
    });
  });
});
