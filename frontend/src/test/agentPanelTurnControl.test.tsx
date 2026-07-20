/**
 * AgentPanel turn control: a turn running for this conversation that the panel
 * is *not* itself streaming (the analyst closed the panel or navigated away
 * mid-turn) must surface as a working Stop, not as an input that silently
 * 409s. Also covers the tool selector staying usable once a conversation
 * exists, editing that conversation rather than seeding from user defaults.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useAgentStore } from "@/stores/agent";
import type { AgentConversation } from "@/api/agent";

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const listConversationsMock = vi.fn();
const getConversationMock = vi.fn();
const listProposalsMock = vi.fn();
const cancelTurnMock = vi.fn();
const updateToolsMock = vi.fn();
const getInfoMock = vi.fn();

vi.mock("@/api/agent", async () => {
  const actual = await vi.importActual<typeof import("@/api/agent")>("@/api/agent");
  return {
    ...actual,
    agentApi: {
      listConversations: (...a: unknown[]) => listConversationsMock(...a),
      getConversation: (...a: unknown[]) => getConversationMock(...a),
      listProposals: (...a: unknown[]) => listProposalsMock(...a),
      cancelTurn: (...a: unknown[]) => cancelTurnMock(...a),
      updateConversationTools: (...a: unknown[]) => updateToolsMock(...a),
      getInfo: (...a: unknown[]) => getInfoMock(...a),
    },
  };
});

const CASE = "c1";
const TL = "t1";
const CONV_ID = "conv1";

function conversation(over: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: CONV_ID,
    case_id: CASE,
    timeline_id: TL,
    user_id: "u1",
    title: "Investigating",
    model_id: "m",
    disabled_tools: null,
    created_at: null,
    updated_at: null,
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AgentPanel
          caseId={CASE}
          timelineId={TL}
          currentFilters={{}}
          onApplyFilters={vi.fn()}
          onClose={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAgentStore.getState().setActiveConversation(`${CASE}/${TL}`, CONV_ID);
  listConversationsMock.mockResolvedValue({ conversations: [conversation()] });
  listProposalsMock.mockResolvedValue({ proposals: [] });
  cancelTurnMock.mockResolvedValue({ cancelled: true });
  updateToolsMock.mockResolvedValue(conversation({ disabled_tools: ["histogram"] }));
  getInfoMock.mockResolvedValue({
    api_base_url: "https://llm.example",
    model: "test-model",
    tools: [
      { name: "histogram", description: "", admin_disabled: false },
      { name: "search_events", description: "", admin_disabled: false },
    ],
    user_disabled_tools: ["search_events"],
  });
});

describe("AgentPanel turn control", () => {
  it("shows Stop and disables the input when a turn is running elsewhere", async () => {
    getConversationMock.mockResolvedValue({ ...conversation({ active: true }), messages: [] });
    renderPanel();

    await screen.findByLabelText(/Stop the running turn/);
    const input = screen.getByPlaceholderText(/Waiting for the running turn/);
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/A turn is still running/)).toBeTruthy();
  });

  it("Stop cancels the turn server-side, not just the local stream", async () => {
    // The whole point: this panel never opened the SSE stream, so aborting a
    // local fetch would do nothing. Only the cancel call can stop the turn.
    getConversationMock.mockResolvedValue({ ...conversation({ active: true }), messages: [] });
    renderPanel();

    fireEvent.click(await screen.findByLabelText(/Stop the running turn/));
    await waitFor(() => expect(cancelTurnMock).toHaveBeenCalledWith(CASE, CONV_ID));
  });

  it("leaves the input usable when no turn is running", async () => {
    getConversationMock.mockResolvedValue({ ...conversation({ active: false }), messages: [] });
    renderPanel();

    const input = await screen.findByPlaceholderText(/What should the agent look into/);
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.queryByText(/A turn is still running/)).toBeNull();
  });

  it("keeps the tool selector available once a conversation exists", async () => {
    // Previously hidden as soon as a conversation existed, so the tool set
    // could not be inspected or corrected without starting a new chat.
    getConversationMock.mockResolvedValue({
      ...conversation({ disabled_tools: ["histogram"] }),
      messages: [],
    });
    renderPanel();
    expect(await screen.findByTestId("agent-panel")).toBeTruthy();
    expect(screen.getByText(/Tools/i)).toBeTruthy();
  });

  it("does not overwrite an existing conversation's tools with user defaults", async () => {
    // The popover seeds from the user's saved defaults on mount. For an
    // existing conversation that would replace the analyst's actual
    // restriction — and persist it through the PATCH.
    getConversationMock.mockResolvedValue({
      ...conversation({ disabled_tools: ["histogram"] }),
      messages: [],
    });
    renderPanel();
    await screen.findByTestId("agent-panel");
    await waitFor(() => expect(getInfoMock).toHaveBeenCalled());
    expect(updateToolsMock).not.toHaveBeenCalled();
  });
});
