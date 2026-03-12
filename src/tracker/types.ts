import type { Issue } from "../shared/types.js";

export interface TrackerAdapter {
  fetchCandidateIssues(): Promise<Issue[]>;
  fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>>;
  updateIssueState(issueId: string, stateName: string): Promise<void>;
  createComment(issueId: string, body: string): Promise<void>;
  createIssue(input: CreateIssueInput): Promise<Issue>;
  searchIssues(query: string): Promise<Issue[]>;
}

export interface CreateIssueInput {
  title: string;
  description: string;
  state?: string;
  priority?: number;
  labels?: string[];
}

export interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string;
  priority: number;
  createdAt: string;
  assignee?: { id: string } | null;
  labels: { nodes: Array<{ name: string }> };
  state: { name: string };
  relations: {
    nodes: Array<{
      type: string;
      relatedIssue: { id: string; state: { name: string } };
    }>;
  };
}

export interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
