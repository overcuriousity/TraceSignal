/**
 * API client for the optional AI investigation agent.
 *
 * All endpoints 503 unless the backend reports `agent_available` in
 * /api/health — callers gate their UI on that flag, so these functions are
 * only reached when the agent is actually configured.
 *
 * The message endpoint streams SSE over a POST response; EventSource is
 * GET-only, so `streamMessage` reads the body via fetch + ReadableStream
 * (same wire format as useCaseStream's EventSource, parsed by hand).
 */
import { BASE, get, post, put, del, fetchBlobGet, ApiError } from "./client";
import type { EventFilters, FieldMatchMode } from "./types";

/** Backend FilterSpec shape (snake_case) — what agent tool calls carry. */
export interface AgentFilterSpec {
  q?: string | null;
  q_regex?: boolean;
  artifacts?: string[] | null;
  source_id?: string | null;
  start?: string | null;
  end?: string | null;
  filters?: Record<string, string[]>;
  exclusions?: Record<string, string[]>;
  filter_modes?: Record<string, string>;
  exclusion_modes?: Record<string, string>;
  tags_include?: string[] | null;
  tags_exclude?: string[] | null;
  annotated?: ("tag" | "anomaly")[] | null;
  annotation_tag_value?: string | null;
  run_id?: string | null;
  event_ids?: string[] | null;
  collapse_routine?: boolean;
}

/** An agent-proposed annotation, propose→confirm (A1): the agent never
 * writes annotations directly — `propose_annotation` creates one of these,
 * and an analyst confirms or rejects it via the endpoints below. */
export interface AgentProposal {
  id: string;
  conversation_id: string;
  case_id: string;
  timeline_id: string;
  status: "proposed" | "confirmed" | "rejected";
  tag: string | null;
  comment: string | null;
  rationale: string;
  events: { source_id: string; event_id: string }[];
  created_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface AgentConversation {
  id: string;
  case_id: string;
  timeline_id: string;
  user_id: string;
  title: string;
  model_id: string | null;
  /** Per-chat tool restriction frozen at creation (null = none). */
  disabled_tools: string[] | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool" | "thinking" | "compaction";
  content: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: unknown;
  created_at: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

/** One tool in the agent's catalog (GET /api/agent/info). */
export interface AgentToolInfo {
  name: string;
  description: string;
  embeddings_gated: boolean;
  requires_conversation: boolean;
  /** Hard-denied by the admin — cannot be re-enabled per user/chat. */
  admin_disabled: boolean;
}

/**
 * Non-admin agent config disclosure: powers the OPSEC notice ("evidence is
 * sent to {api_base_url}, processed by {model}") and the tool toggles in the
 * new-conversation dialog. Never contains the API key.
 */
export interface AgentInfo {
  model: string | null;
  provider: string;
  api_base_url: string | null;
  context_window: number | null;
  compact_threshold: number | null;
  tools: AgentToolInfo[];
  user_disabled_tools: string[];
}

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "compaction"; summary: string; reason?: string }
  | { type: "tool_call"; tool_call_id: string; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id: string; tool: string; result: unknown }
  | {
      type: "done";
      content: string;
      prompt_tokens?: number | null;
      completion_tokens?: number | null;
    }
  | { type: "error"; detail: string; code?: string };

/** Compact token count: 890, 12.4k, 1.2M. */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Map a backend FilterSpec onto the Explorer's EventFilters (camelCase). */
export function specToEventFilters(spec: AgentFilterSpec): EventFilters {
  const modes = (m?: Record<string, string>): Record<string, FieldMatchMode> | undefined => {
    if (!m) return undefined;
    const out: Record<string, FieldMatchMode> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v === "wildcard" || v === "regex") out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const f: EventFilters = {};
  if (spec.q) f.q = spec.q;
  if (spec.q_regex) f.qRegex = true;
  if (spec.artifacts?.length) f.artifacts = spec.artifacts;
  if (spec.source_id) f.sourceId = spec.source_id;
  if (spec.start) f.start = spec.start;
  if (spec.end) f.end = spec.end;
  if (spec.filters && Object.keys(spec.filters).length > 0) f.filters = spec.filters;
  if (spec.exclusions && Object.keys(spec.exclusions).length > 0) f.exclusions = spec.exclusions;
  const fm = modes(spec.filter_modes);
  if (fm) f.filterModes = fm;
  const em = modes(spec.exclusion_modes);
  if (em) f.exclusionModes = em;
  if (spec.tags_include?.length) f.tagsInclude = spec.tags_include;
  if (spec.tags_exclude?.length) f.tagsExclude = spec.tags_exclude;
  if (spec.annotated?.length) f.annotated = spec.annotated;
  if (spec.annotation_tag_value) f.annotationTagValue = spec.annotation_tag_value;
  if (spec.run_id) f.anomalyRunId = spec.run_id;
  if (spec.event_ids?.length) f.ids = spec.event_ids;
  if (spec.collapse_routine) f.collapseRoutine = true;
  return f;
}

export const agentApi = {
  /** Config + tool catalog for the current user (see AgentInfo). */
  getInfo: () => get<AgentInfo>(`/agent/info`),

  /** Persist the user's default tool selection for new conversations. */
  updatePreferences: (disabledTools: string[]) =>
    put<{ disabled_tools: string[] }>(`/agent/preferences`, { disabled_tools: disabledTools }),

  createConversation: (caseId: string, timelineId: string, disabledTools?: string[]) =>
    post<AgentConversation>(`/cases/${caseId}/agent/conversations`, {
      timeline_id: timelineId,
      ...(disabledTools && disabledTools.length > 0 ? { disabled_tools: disabledTools } : {}),
    }),

  listConversations: (caseId: string, timelineId?: string) =>
    get<{ conversations: AgentConversation[] }>(`/cases/${caseId}/agent/conversations`, {
      timeline_id: timelineId,
    }),

  getConversation: (caseId: string, conversationId: string) =>
    get<AgentConversation & { messages: AgentMessage[] }>(
      `/cases/${caseId}/agent/conversations/${conversationId}`,
    ),

  deleteConversation: (caseId: string, conversationId: string) =>
    del<{ deleted: boolean }>(`/cases/${caseId}/agent/conversations/${conversationId}`),

  /** Full-thread JSON export (messages, tool calls, thinking, raw history). */
  exportConversation: (caseId: string, conversationId: string) =>
    fetchBlobGet(`/cases/${caseId}/agent/conversations/${conversationId}/export`),

  listProposals: (caseId: string, conversationId: string) =>
    get<{ proposals: AgentProposal[] }>(
      `/cases/${caseId}/agent/conversations/${conversationId}/proposals`,
    ),

  confirmProposal: (caseId: string, conversationId: string, proposalId: string) =>
    post<{ proposal: AgentProposal; written: number; skipped_event_ids: string[] }>(
      `/cases/${caseId}/agent/conversations/${conversationId}/proposals/${proposalId}/confirm`,
    ),

  rejectProposal: (caseId: string, conversationId: string, proposalId: string) =>
    post<{ proposal: AgentProposal }>(
      `/cases/${caseId}/agent/conversations/${conversationId}/proposals/${proposalId}/reject`,
    ),

  /**
   * Send a message and stream the agent's turn. Resolves once the stream
   * ends; `onEvent` fires for each SSE event as it arrives.
   */
  async streamMessage(
    caseId: string,
    conversationId: string,
    body: { content: string; view_filters?: EventFilters | null },
    onEvent: (event: AgentStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(
      `${BASE}/cases/${caseId}/agent/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        signal,
      },
    );
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try {
        detail = ((await res.json()) as { detail?: string }).detail ?? detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, detail);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      for (;;) {
        const sep = buffer.indexOf("\n\n");
        if (sep === -1) break;
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue; // keepalives/comments
          try {
            onEvent(JSON.parse(line.slice(6)) as AgentStreamEvent);
          } catch {
            // Malformed frame — skip rather than kill the stream.
          }
        }
      }
    }
  },
};
