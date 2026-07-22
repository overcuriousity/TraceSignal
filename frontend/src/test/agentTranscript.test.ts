import { describe, expect, it } from "vitest";
import { capPersistedForStream, type TurnBaseline } from "@/components/agent/transcript";
import type { AgentMessage } from "@/api/agent";

function msg(role: AgentMessage["role"], content: string): AgentMessage {
  return {
    id: content,
    conversation_id: "c1",
    role,
    content,
    tool_name: null,
    tool_args: null,
    tool_result: null,
    tool_call_id: null,
    prompt_tokens: null,
    completion_tokens: null,
    created_at: "2026-07-22T00:00:00Z",
  } as AgentMessage;
}

describe("capPersistedForStream", () => {
  const baseline: TurnBaseline = { conversationId: "c1", messageCount: 2 };
  const history = [msg("user", "first"), msg("assistant", "reply")];
  const midTurn = [...history, msg("user", "second"), msg("thinking", "hmm")];

  it("caps at the send-time snapshot while streaming, so rows the live stream already renders are not shown twice", () => {
    expect(capPersistedForStream(midTurn, true, "c1", baseline)).toEqual(history);
  });

  it("returns everything when not streaming", () => {
    expect(capPersistedForStream(midTurn, false, "c1", baseline)).toEqual(midTurn);
  });

  it("ignores a baseline from a different conversation", () => {
    expect(capPersistedForStream(midTurn, true, "c2", baseline)).toEqual(midTurn);
  });

  it("returns everything when no baseline was recorded", () => {
    expect(capPersistedForStream(midTurn, true, "c1", null)).toEqual(midTurn);
  });

  it("caps a brand-new conversation to empty (baseline 0)", () => {
    const fresh = [msg("user", "second"), msg("thinking", "hmm")];
    expect(
      capPersistedForStream(fresh, true, "c1", { conversationId: "c1", messageCount: 0 }),
    ).toEqual([]);
  });
});
