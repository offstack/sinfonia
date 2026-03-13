/**
 * Formats raw Claude Code stream-json events into human-readable strings
 * for TUI/dashboard display.
 *
 * Returns null for noisy events (content_block_delta, etc.) to avoid
 * rapid flickering in the TUI.
 */

const TOOL_LABELS: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  Bash: "Running",
  Glob: "Searching",
  Grep: "Grep",
  WebFetch: "Fetching",
  WebSearch: "Searching web",
  TodoRead: "Reading todos",
  TodoWrite: "Writing todos",
};

export function formatAgentEvent(
  type: string,
  data?: Record<string, unknown>,
): string | null {
  if (!data) {
    // Bare type with no data — use type directly for "result"
    if (type === "result") return "Completed";
    if (type === "stderr") return null;
    return null;
  }

  switch (type) {
    case "assistant": {
      return formatAssistantEvent(data);
    }

    case "result": {
      return "Completed";
    }

    case "stderr": {
      const text = typeof data.text === "string" ? data.text : "";
      if (!text) return null;
      return `stderr: ${text.slice(0, 60)}`;
    }

    case "output": {
      return null; // Raw output lines — skip
    }

    // Noisy streaming events — suppress
    case "content_block_start":
    case "content_block_delta":
    case "content_block_stop":
    case "message_start":
    case "message_delta":
    case "message_stop":
      return null;

    default:
      return null;
  }
}

function formatAssistantEvent(data: Record<string, unknown>): string | null {
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const content = message.content as Array<Record<string, unknown>> | undefined;
  if (!content || !Array.isArray(content)) return null;

  // Look through content blocks for tool_use first (most informative)
  for (const block of content) {
    if (block.type === "tool_use") {
      return formatToolUse(block);
    }
  }

  // Check for thinking
  for (const block of content) {
    if (block.type === "thinking") {
      return "Thinking...";
    }
  }

  // Text response
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      const text = block.text.trim();
      if (text.length > 0) {
        return "Responding...";
      }
    }
  }

  return null;
}

function formatToolUse(block: Record<string, unknown>): string {
  const toolName = (block.name as string) ?? "unknown";
  const label = TOOL_LABELS[toolName] ?? toolName;
  const input = block.input as Record<string, unknown> | undefined;

  if (!input) return label;

  // Extract useful context based on tool
  switch (toolName) {
    case "Read": {
      const filePath = input.file_path as string | undefined;
      return filePath ? `Reading ${shortenPath(filePath)}` : "Reading file";
    }
    case "Write": {
      const filePath = input.file_path as string | undefined;
      return filePath ? `Writing ${shortenPath(filePath)}` : "Writing file";
    }
    case "Edit": {
      const filePath = input.file_path as string | undefined;
      return filePath ? `Editing ${shortenPath(filePath)}` : "Editing file";
    }
    case "Bash": {
      const cmd = input.command as string | undefined;
      if (cmd) {
        const shortCmd = cmd.split("\n")[0].slice(0, 40);
        return `Running: ${shortCmd}`;
      }
      return "Running command";
    }
    case "Glob": {
      const pattern = input.pattern as string | undefined;
      return pattern ? `Searching: ${pattern}` : "Searching files";
    }
    case "Grep": {
      const pattern = input.pattern as string | undefined;
      return pattern ? `Grep: ${pattern.slice(0, 30)}` : "Searching content";
    }
    default:
      return label;
  }
}

function shortenPath(filePath: string): string {
  // Show just filename or last 2 path segments
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 2) return filePath;
  return parts.slice(-2).join("/");
}
