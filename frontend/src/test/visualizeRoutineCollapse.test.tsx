/**
 * VisualizePage routine-collapse parity (#147 follow-up).
 *
 * The page inherits the Explorer's filters from the URL — but `collapseRoutine`
 * is deliberately never URL-serialized, so before this fix the page could not
 * know about mutes at all: every chart aggregated the uncollapsed superset
 * while the grid collapsed, with no indicator. A mute is a filter, so the page
 * derives collapse from the disposition set exactly like ExplorerPage
 * (lib/routineCollapse.ts), shows what is hidden, and offers the same
 * self-expiring reveal.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VisualizePage } from "@/pages/VisualizePage";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { installFakeResizeObserver } from "./helpers/resizeObserver";
import { installRadixJsdomStubs } from "./helpers/radix";
import type { Disposition, DispositionListResponse, VizFieldsResponse } from "@/api/types";

beforeAll(() => {
  installFakeResizeObserver();
  installRadixJsdomStubs();
});

const fieldsMock = vi.fn();
const fieldTermsMock = vi.fn();
const dispositionsListMock = vi.fn();

vi.mock("@/api/viz", async () => {
  const actual = await vi.importActual<typeof import("@/api/viz")>("@/api/viz");
  return {
    ...actual,
    vizApi: {
      ...actual.vizApi,
      fields: (...args: unknown[]) => fieldsMock(...args),
      fieldTerms: (...args: unknown[]) => fieldTermsMock(...args),
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

const FIELDS: VizFieldsResponse = {
  fields: [{ token: "artifact", distinct: 12, coverage: 0.98 }],
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

// A field-scoped bar chart so fieldTerms is the active data query.
const START = "/cases/c1/timelines/t1/visualize?c_type=bar&c_scale=nominal&c_field=artifact";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[START]}>
          <Routes>
            <Route path="/cases/:caseId/timelines/:timelineId/visualize" element={<VisualizePage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fieldsMock.mockReset().mockResolvedValue(FIELDS);
  fieldTermsMock
    .mockReset()
    .mockResolvedValue({ field: "artifact", total: 10, distinct: 2, values: [], other_count: 0 });
  dispositionsListMock.mockReset();
});

describe("VisualizePage routine collapse", () => {
  it("derives collapse from the disposition set — charts query the collapsed set", async () => {
    const resp: DispositionListResponse = { dispositions: [routineDisposition("d1")] };
    dispositionsListMock.mockResolvedValue(resp);

    renderPage();

    await waitFor(() => expect(fieldTermsMock).toHaveBeenCalled());
    const filters = fieldTermsMock.mock.calls[0][3] as Record<string, unknown>;
    expect(filters.collapseRoutine).toBe(true);
  });

  it("never fires a chart query before the disposition set is known", async () => {
    // The Explorer's #147 race, one page over: an uncollapsed first fetch
    // would flash-and-recompute every chart on load whenever mutes exist.
    const resp: DispositionListResponse = { dispositions: [routineDisposition("d1")] };
    dispositionsListMock.mockResolvedValue(resp);

    renderPage();

    await waitFor(() => expect(fieldTermsMock).toHaveBeenCalled());
    for (const call of fieldTermsMock.mock.calls) {
      expect((call[3] as Record<string, unknown>).collapseRoutine).toBe(true);
    }
  });

  it("shows an indicator and reveals on toggle — the charts refetch uncollapsed", async () => {
    const resp: DispositionListResponse = { dispositions: [routineDisposition("d1")] };
    dispositionsListMock.mockResolvedValue(resp);

    renderPage();

    const toggle = await screen.findByRole("button", { name: /routine/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      const last = fieldTermsMock.mock.calls.at(-1)![3] as Record<string, unknown>;
      expect(last.collapseRoutine).toBeUndefined();
    });
  });

  it("stays uncollapsed with no routine dispositions, without any indicator", async () => {
    dispositionsListMock.mockResolvedValue({ dispositions: [] } as DispositionListResponse);

    renderPage();

    await waitFor(() => expect(fieldTermsMock).toHaveBeenCalled());
    const filters = fieldTermsMock.mock.calls[0][3] as Record<string, unknown>;
    expect(filters.collapseRoutine).toBeUndefined();
    expect(screen.queryByRole("button", { name: /routine/i })).toBeNull();
  });
});
