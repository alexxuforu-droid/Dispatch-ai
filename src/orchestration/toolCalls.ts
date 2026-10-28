import { firstJsonObject } from './json';
import { MAX_TOOL_CALLS, toolCallProblem, WorkspaceToolCall } from './workspaceTools';

export type ToolCallParse =
  /** The reply asked for no tools. */
  | { kind: 'none' }
  /** The reply asked for tools and they parsed. */
  | { kind: 'calls'; calls: WorkspaceToolCall[] }
  /**
   * The reply asked for tools but could not be parsed. The caller must say so, not act as if no
   * tools were requested. `retryable` marks the reply that named a tool but did not match the
   * contract: the agent can be told what was wrong and try again.
   */
  | { kind: 'invalid'; reason: string; retryable?: boolean };

/**
 * Parses the tool-call envelope out of a model reply.
 *
 * 'none' and 'invalid' are different facts: 'none' means the agent finished, 'invalid' means the
 * agent tried to call tools and the reply was broken. Collapsing the two made a broken reply look
 * like an agent that never asked for anything.
 *
 * Every call is checked against the tool contract before it is handed on, so a call with a
 * renamed argument, an unknown tool name or a path that is not a string is reported as invalid
 * instead of being run against the project folder.
 */
export function parseToolCalls(output: string): ToolCallParse {
  const object = firstJsonObject(output, value => Array.isArray(value.toolCalls));
  if (object) {
    const raw = object.toolCalls as unknown[];
    for (const entry of raw) {
      const problem = toolCallProblem(entry);
      if (problem) return { kind: 'invalid', reason: problem, retryable: true };
    }
    return { kind: 'calls', calls: raw.slice(0, MAX_TOOL_CALLS) as WorkspaceToolCall[] };
  }
  if (/toolCalls/i.test(output)) return { kind: 'invalid', reason: 'the reply mentioned tool calls but its JSON could not be parsed' };
  return { kind: 'none' };
}
