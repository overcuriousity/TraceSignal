import type { AgentMessage } from "@/api/agent";

/** Persisted-message count for the conversation at the moment a turn was sent. */
export interface TurnBaseline {
  conversationId: string;
  messageCount: number;
}

/**
 * Cap the persisted transcript at the send-time snapshot while a turn streams.
 *
 * The server persists rows as the turn runs (the user row first, then
 * thinking/tool/assistant rows), and any mid-stream refetch — the mount fetch
 * of a freshly created conversation, or TanStack Query's window-focus
 * refetch — hands those rows back while the live stream is already rendering
 * the same content. Slicing at the baseline keeps this turn's rows out of the
 * persisted list until streaming ends and the live items are dropped.
 */
export function capPersistedForStream(
  messages: AgentMessage[],
  streaming: boolean,
  activeConversationId: string | null,
  baseline: TurnBaseline | null,
): AgentMessage[] {
  if (!streaming || !baseline || baseline.conversationId !== activeConversationId) {
    return messages;
  }
  return messages.slice(0, baseline.messageCount);
}
