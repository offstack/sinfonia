import Handlebars from "handlebars";
import type { Issue } from "../shared/types.js";

export function renderPrompt(template: string, issue: Issue, isContinuation: boolean): string {
  const compiled = Handlebars.compile(template, { noEscape: true });

  const context = {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      state: issue.state,
      priority: issue.priority,
      labels: issue.labels,
    },
    is_continuation: isContinuation,
  };

  let prompt = compiled(context);

  if (isContinuation) {
    prompt += "\n\n---\nThis is a continuation. The issue is still active. Review your previous work and continue where you left off.";
  }

  return prompt;
}
