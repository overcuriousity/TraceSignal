/**
 * ChartProposalCard (A9) smoke test: fetches live data through the mocked
 * vizApi/eventsApi per `AgentChartSpec.kind`, renders the matching chart
 * component, and the Save button posts through savedChartsApi.create.
 *
 * jsdom has no ResizeObserver — same polyfill as vizCharts.smoke.test.tsx.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChartProposalCard } from "@/components/agent/ChartProposalCard";
import type { AgentChartSpec } from "@/api/agent";
import type { FieldTermsResponse, FieldNumericResponse, HistogramResponse } from "@/api/types";

beforeAll(() => {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width: 400 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error -- jsdom has no native ResizeObserver
  global.ResizeObserver = FakeResizeObserver;
});

const fieldTermsMock = vi.fn();
const fieldNumericMock = vi.fn();
const punchcardMock = vi.fn();
const savedChartsCreateMock = vi.fn();
const histogramMock = vi.fn();

vi.mock("@/api/viz", async () => {
  const actual = await vi.importActual<typeof import("@/api/viz")>("@/api/viz");
  return {
    ...actual,
    vizApi: {
      fieldTerms: (...args: unknown[]) => fieldTermsMock(...args),
      fieldNumeric: (...args: unknown[]) => fieldNumericMock(...args),
      punchcard: (...args: unknown[]) => punchcardMock(...args),
      fieldTimeseries: vi.fn(),
      fieldPivot: vi.fn(),
      fieldScatter: vi.fn(),
      compare: vi.fn(),
    },
    savedChartsApi: {
      create: (...args: unknown[]) => savedChartsCreateMock(...args),
    },
  };
});
vi.mock("@/api/events", () => ({
  eventsApi: { histogram: (...args: unknown[]) => histogramMock(...args) },
}));

const CASE = "c1";
const TL = "t1";

const TERMS: FieldTermsResponse = {
  field: "artifact",
  total: 100,
  distinct: 3,
  other_count: 10,
  values: [
    { value: "GET", count: 60 },
    { value: "POST", count: 30 },
  ],
};

const NUMERIC: FieldNumericResponse = {
  field: "attr:bytes",
  count: 100,
  min: 0,
  max: 100,
  mean: 50,
  stddev: 20,
  quantiles: {},
  bins: [{ x0: 0, x1: 50, count: 60 }],
};

const HISTOGRAM: HistogramResponse = {
  interval_seconds: 3600,
  min: "2024-01-01T00:00:00Z",
  max: "2024-01-01T02:00:00Z",
  buckets: [{ start: "2024-01-01T00:00:00Z", count: 5 }],
};

function renderCard(spec: AgentChartSpec) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ChartProposalCard
          caseId={CASE}
          timelineId={TL}
          title="Artifact spread"
          description="top artifacts"
          spec={spec}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fieldTermsMock.mockResolvedValue(TERMS);
  fieldNumericMock.mockResolvedValue(NUMERIC);
  punchcardMock.mockResolvedValue({ kind: "punchcard", total: 10, max_count: 5, cells: [] });
  histogramMock.mockResolvedValue(HISTOGRAM);
  savedChartsCreateMock.mockResolvedValue({ chart: { id: "sc1" } });
});

describe("ChartProposalCard", () => {
  it("renders a bar chart for kind=terms", async () => {
    const { container } = renderCard({ kind: "terms", field: "artifact" });
    await waitFor(() => expect(fieldTermsMock).toHaveBeenCalled());
    expect(container.querySelector("svg")).not.toBeNull();
    expect(fieldTermsMock.mock.calls[0][2]).toBe("artifact");
  });

  it("renders a histogram for kind=numeric", async () => {
    const { container } = renderCard({ kind: "numeric", field: "attr:bytes" });
    await waitFor(() => expect(fieldNumericMock).toHaveBeenCalled());
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a time histogram for kind=compare_time without comparison_filters", async () => {
    const { container } = renderCard({ kind: "compare_time" });
    await waitFor(() => expect(histogramMock).toHaveBeenCalled());
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a punchcard for kind=punchcard", async () => {
    const { container } = renderCard({ kind: "punchcard" });
    await waitFor(() => expect(punchcardMock).toHaveBeenCalled());
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows an error message when the fetch fails", async () => {
    fieldTermsMock.mockRejectedValue(new Error("boom"));
    renderCard({ kind: "terms", field: "artifact" });
    await screen.findByText(/Couldn't load this chart/);
  });

  it("Save posts through savedChartsApi.create with the mapped ChartConfig", async () => {
    renderCard({ kind: "terms", field: "artifact", limit: 20 });
    await waitFor(() => expect(fieldTermsMock).toHaveBeenCalled());
    const input = screen.getByPlaceholderText("Save as…");
    fireEvent.change(input, { target: { value: "my chart" } });
    fireEvent.click(screen.getByLabelText("Save chart"));
    await waitFor(() => expect(savedChartsCreateMock).toHaveBeenCalled());
    const [caseId, timelineId, name, config] = savedChartsCreateMock.mock.calls[0];
    expect(caseId).toBe(CASE);
    expect(timelineId).toBe(TL);
    expect(name).toBe("my chart");
    expect(config).toMatchObject({ v: 1, chartType: "bar", field: "artifact" });
  });

  it("Open in Visualize link carries the mapped chart-config params", async () => {
    renderCard({ kind: "numeric", field: "attr:bytes" });
    await waitFor(() => expect(fieldNumericMock).toHaveBeenCalled());
    const link = screen.getByRole("link", { name: /Open in Visualize/ });
    const href = link.getAttribute("href")!;
    expect(href).toContain(`/cases/${CASE}/timelines/${TL}/visualize`);
    expect(href).toContain("c_type=histogram");
    expect(href).toContain("c_field=attr%3Abytes");
  });
});
