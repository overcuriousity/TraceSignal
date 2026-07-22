/**
 * ExplorerPage routine-collapse wiring (#147).
 *
 * The resolver (lib/routineCollapse.ts) is unit-tested; what broke in #147 was
 * the *wiring* — the disposition-derived collapse never reached the events
 * request. This mounts the page and asserts the request-level truth:
 *
 * 1. The events query waits for the disposition set — no uncollapsed first
 *    fetch that flashes muted events and burns a ClickHouse scan on every
 *    load, only to be refetched collapsed a moment later.
 * 2. Once issued, the request's filters carry `collapseRoutine` whenever a
 *    routine disposition exists.
 *
 * Presentational children (grid, histogram, rails, panels) are stubbed: they
 * have their own tests, and this test's subject is the page's query wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { Disposition, Event, EventPage } from "@/api/types";

const eventsListMock = vi.fn();
const getByIdMock = vi.fn();
const dispositionsListMock = vi.fn();

// Latest props the (stubbed) grid and detail panel were rendered with — lets a
// test drive onExpand/onJumpToTime and read back what the grid received.
const captures = vi.hoisted(() => ({
  grid: null as null | Record<string, unknown>,
  detail: null as null | Record<string, unknown>,
}));

vi.mock("@/api/events", async () => {
  const actual = await vi.importActual<typeof import("@/api/events")>("@/api/events");
  return {
    ...actual,
    eventsApi: {
      ...actual.eventsApi,
      list: (...args: unknown[]) => eventsListMock(...args),
      getById: (...args: unknown[]) => getByIdMock(...args),
      mergedTags: async () => [],
      artifacts: async () => [],
      fields: async () => ({ top_level: [], attributes: [] }),
    },
  };
});
vi.mock("@/api/dispositions", async () => {
  const actual = await vi.importActual<typeof import("@/api/dispositions")>("@/api/dispositions");
  return {
    ...actual,
    dispositionsApi: {
      ...actual.dispositionsApi,
      list: (...args: unknown[]) => dispositionsListMock(...args),
    },
  };
});
vi.mock("@/api/annotations", async () => {
  const actual = await vi.importActual<typeof import("@/api/annotations")>("@/api/annotations");
  return {
    ...actual,
    annotationsApi: {
      ...actual.annotationsApi,
      listForTimeline: async () => [],
      listDistinctTags: async () => [],
    },
  };
});
vi.mock("@/api/timelines", async () => {
  const actual = await vi.importActual<typeof import("@/api/timelines")>("@/api/timelines");
  return {
    ...actual,
    timelinesApi: {
      ...actual.timelinesApi,
      get: async () => ({ id: "t1", case_id: "c1", name: "T1", source_ids: ["s1"] }),
      listSources: async () => [],
    },
  };
});
vi.mock("@/api/views", async () => {
  const actual = await vi.importActual<typeof import("@/api/views")>("@/api/views");
  return {
    ...actual,
    viewsApi: { ...actual.viewsApi, list: async () => [] },
  };
});
vi.mock("@/api/baselines", async () => {
  const actual = await vi.importActual<typeof import("@/api/baselines")>("@/api/baselines");
  return {
    ...actual,
    baselinesApi: { ...actual.baselinesApi, list: async () => ({ baselines: [] }) },
  };
});
vi.mock("@/api/health", () => ({
  useHealth: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useCaseStream", () => ({
  useCaseStream: () => undefined,
}));

// Presentational children stubbed — the page's query wiring is the subject.
// The grid/detail stubs capture their latest props so a test can drive
// onExpand/onJumpToTime and read back what the grid was handed.
vi.mock("@/components/explorer/EventGrid", () => ({
  EventGrid: (props: Record<string, unknown>) => {
    captures.grid = props;
    return null;
  },
}));
vi.mock("@/components/explorer/TimelineHistogram", () => ({
  TimelineHistogram: () => null,
}));
vi.mock("@/components/explorer/FilterRail", () => ({
  FilterRail: () => null,
}));
vi.mock("@/components/explorer/FilterChips", () => ({
  FilterChips: () => null,
}));
vi.mock("@/components/explorer/EventDetailPanel", () => ({
  EventDetailPanel: (props: Record<string, unknown>) => {
    captures.detail = props;
    return null;
  },
}));
vi.mock("@/components/analysis/InvestigatePanel", () => ({
  InvestigatePanel: () => null,
}));
vi.mock("@/components/agent/AgentPanel", () => ({
  AgentPanel: () => null,
}));
vi.mock("@/components/viz/FieldHistogramModal", () => ({
  FieldHistogramModal: () => null,
}));

import { ExplorerPage } from "@/pages/ExplorerPage";

const PAGE: EventPage = {
  total: 0,
  offset: 0,
  limit: 100,
  events: [],
  has_more_after: false,
  has_more_before: false,
  next_cursor: null,
  prev_cursor: null,
  routine_collapsed_count: 0,
};

function routineDisposition(id: string): Disposition {
  return {
    id,
    case_id: "c1",
    timeline_id: "t1",
    kind: "routine",
    detector: "log_template",
    field: "template_id",
    value: "4736",
    source_id: null,
    event_id: null,
    note: null,
    details: null,
    created_by: null,
    created_at: null,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/cases/c1/timelines/t1"]}>
          <Routes>
            <Route path="/cases/:caseId/timelines/:timelineId" element={<ExplorerPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  eventsListMock.mockReset().mockResolvedValue(PAGE);
  getByIdMock.mockReset();
  dispositionsListMock.mockReset();
  captures.grid = null;
  captures.detail = null;
});

function event(id: string, ts: string): Event {
  return {
    event_id: id,
    timestamp: ts,
    source_id: "s1",
    message: id,
    artifact: null,
    tags: [],
    attributes: {},
  } as unknown as Event;
}

describe("ExplorerPage routine-collapse wiring", () => {
  it("waits for the disposition set, then queries collapsed — never the uncollapsed superset first", async () => {
    let resolveDispositions!: (v: { dispositions: Disposition[] }) => void;
    dispositionsListMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDispositions = resolve;
      }),
    );

    renderPage();

    // Grace period: the events query must not fire while dispositions are
    // still loading — this uncollapsed fetch was the #147 flash.
    await new Promise((r) => setTimeout(r, 50));
    expect(eventsListMock).not.toHaveBeenCalled();

    resolveDispositions({ dispositions: [routineDisposition("d1")] });

    await waitFor(() => expect(eventsListMock).toHaveBeenCalled());
    const filters = eventsListMock.mock.calls[0][2] as Record<string, unknown>;
    expect(filters.collapseRoutine).toBe(true);
  });

  it("queries uncollapsed when no routine disposition exists", async () => {
    dispositionsListMock.mockResolvedValue({ dispositions: [] });

    renderPage();

    await waitFor(() => expect(eventsListMock).toHaveBeenCalled());
    for (const call of eventsListMock.mock.calls) {
      expect((call[2] as Record<string, unknown>).collapseRoutine).toBeFalsy();
    }
  });

  // #150: with collapse on, "locate this event" seeded the cache under a
  // hardcoded `{}` key that no longer matched the collapse-aware live key, so
  // the anchor page never reached the grid and nothing scrolled. The fix seeds
  // the *current* key. Here the located event E0 is muted (the filtered probe
  // returns it hidden), its "after" neighbour E2 comes only from the seek — so
  // E2 appearing in the grid proves the seed landed on the key the grid reads.
  it("locate under collapse seeds the grid (target reachable) and flags it hidden", async () => {
    const E0 = event("E0", "2026-01-01T00:00:00Z");
    const E2 = event("E2", "2026-01-01T00:00:02Z");
    dispositionsListMock.mockResolvedValue({ dispositions: [routineDisposition("d1")] });
    getByIdMock.mockResolvedValue(E0);
    eventsListMock.mockImplementation(
      (
        _c: string,
        _t: string,
        filters: Record<string, unknown> | undefined,
        _signal: unknown,
        cursor: { before?: string; after?: string } | undefined,
      ) => {
        const f = filters ?? {};
        if (cursor?.after) return Promise.resolve({ ...PAGE, events: [E2] });
        if (cursor?.before) return Promise.resolve({ ...PAGE, events: [] });
        // Filtered membership probe for the target → empty means "hidden".
        if (Array.isArray(f.ids) && (f.ids as string[]).includes("E0")) {
          return Promise.resolve({ ...PAGE, events: [] });
        }
        return Promise.resolve({ ...PAGE, events: [E0] });
      },
    );

    renderPage();

    // Initial collapsed page loaded, grid shows just E0.
    await waitFor(() => {
      expect(captures.grid).not.toBeNull();
      expect((captures.grid!.events as Event[]).map((e) => e.event_id)).toEqual(["E0"]);
    });

    // Open the detail panel for E0, then trigger its "locate".
    await act(async () => {
      (captures.grid!.onExpand as (e: Event) => void)(E0);
    });
    await waitFor(() => expect(captures.detail).not.toBeNull());
    await act(async () => {
      await (captures.detail!.onJumpToTime as (ts: string, id: string) => Promise<void>)(
        E0.timestamp!,
        "E0",
      );
    });

    // The seeked anchor page (E0 spliced from getById + E2 from the "after"
    // neighbour) reached the grid, and E0 is flagged as normally hidden.
    await waitFor(() => {
      expect((captures.grid!.events as Event[]).map((e) => e.event_id)).toContain("E2");
      expect(captures.grid!.locatedHiddenId).toBe("E0");
    });

    // Every events request in this flow carried collapse — no seek ever
    // silently dropped it (the key-parity guarantee).
    for (const call of eventsListMock.mock.calls) {
      expect((call[2] as Record<string, unknown>).collapseRoutine).toBe(true);
    }
  });
});
