import { describe, it, expect } from "vitest";
import {
  computeDetectorCoverage,
  dispositionCoversFinding,
  summarizeCoverage,
} from "@/lib/triage-coverage";
import { DETECTORS_BY_ID } from "@/components/analysis/detector-registry";
import type { AnomaliesResponse, AnomalyFinding, Disposition } from "@/api/types";

function finding(over: Partial<AnomalyFinding> = {}): AnomalyFinding {
  return {
    event_id: null,
    event: null,
    details: {},
    ...over,
  } as AnomalyFinding;
}

function disposition(over: Partial<Disposition> = {}): Disposition {
  return {
    id: "d1",
    case_id: "c1",
    timeline_id: "t1",
    kind: "dismissed",
    detector: "*",
    field: null,
    value: null,
    source_id: null,
    event_id: null,
    note: null,
    details: null,
    created_by: null,
    created_at: null,
    ...over,
  };
}

function response(over: Partial<AnomaliesResponse> = {}): AnomaliesResponse {
  return {
    status: "ok",
    detector: "value_novelty",
    method: "self-baseline",
    baseline_size: 100,
    results: [],
    z_threshold: null,
    run_id: null,
    ...over,
  };
}

const NOVELTY = DETECTORS_BY_ID.novelty;
const SEQUENCE = DETECTORS_BY_ID.sequence;

describe("dispositionCoversFinding", () => {
  it("matches value scope via allowlist_field/allowlist_value", () => {
    const f = finding({ details: { allowlist_field: "user", allowlist_value: "root" } });
    const d = disposition({ detector: "value_novelty", field: "user", value: "root" });
    expect(dispositionCoversFinding(f, d, "value_novelty")).toBe(true);
    expect(
      dispositionCoversFinding(f, disposition({ ...d, value: "admin" }), "value_novelty"),
    ).toBe(false);
  });

  it("matches event scope via event_id", () => {
    const f = finding({ event_id: "ev1" });
    const d = disposition({ detector: "timestamp_order", event_id: "ev1", source_id: "s1" });
    expect(dispositionCoversFinding(f, d, "timestamp_order")).toBe(true);
    expect(dispositionCoversFinding(finding({ event_id: "ev2" }), d, "timestamp_order")).toBe(false);
  });

  it("gates on detector, with '*' matching every detector", () => {
    const f = finding({ details: { allowlist_field: "user", allowlist_value: "root" } });
    const star = disposition({ detector: "*", field: "user", value: "root" });
    const other = disposition({ detector: "charset", field: "user", value: "root" });
    expect(dispositionCoversFinding(f, star, "value_novelty")).toBe(true);
    expect(dispositionCoversFinding(f, other, "value_novelty")).toBe(false);
  });

  it("routine sequence_motif verdicts cover the identical sequence_novelty n-gram", () => {
    const gram = "login → sudo → passwd";
    const f = finding({ details: { allowlist_field: "message", allowlist_value: gram } });
    const routine = disposition({
      kind: "routine",
      detector: "sequence_motif",
      field: "message",
      value: gram,
    });
    expect(dispositionCoversFinding(f, routine, "sequence_novelty")).toBe(true);
    // different n-gram — exact key equality, no containment guessing
    const otherGram = finding({
      details: { allowlist_field: "message", allowlist_value: "login → sudo" },
    });
    expect(dispositionCoversFinding(otherGram, routine, "sequence_novelty")).toBe(false);
    // sequence_motif detector key does not leak to other detectors
    expect(dispositionCoversFinding(f, routine, "value_novelty")).toBe(false);
    // non-routine sequence_motif rows don't cross over either
    const dismissed = disposition({ ...routine, kind: "dismissed" });
    expect(dispositionCoversFinding(f, dismissed, "sequence_novelty")).toBe(false);
  });
});

describe("computeDetectorCoverage", () => {
  it("returns null for errored or no-data responses", () => {
    expect(computeDetectorCoverage(NOVELTY, null, [])).toBeNull();
    expect(computeDetectorCoverage(NOVELTY, response({ status: "no_data" }), [])).toBeNull();
  });

  it("counts dismissed in numerator and denominator", () => {
    const r = response({ results: [finding()], total_findings: 1, dismissed_count: 2 });
    const cov = computeDetectorCoverage(NOVELTY, r, [])!;
    expect(cov.reviewed).toBe(2);
    expect(cov.denominator).toBe(3);
    expect(cov.truncated).toBe(false);
  });

  it("counts fetched findings covered by confirmed/routine dispositions", () => {
    const covered = finding({ details: { allowlist_field: "user", allowlist_value: "root" } });
    const uncovered = finding({ details: { allowlist_field: "user", allowlist_value: "adm" } });
    const r = response({ results: [covered, uncovered], total_findings: 2 });
    const rows = [
      disposition({ kind: "confirmed", detector: "value_novelty", field: "user", value: "root" }),
    ];
    const cov = computeDetectorCoverage(NOVELTY, r, rows)!;
    expect(cov.coveredVisible).toBe(1);
    expect(cov.reviewed).toBe(1);
    expect(cov.denominator).toBe(2);
    expect(cov.verdictsByKind.confirmed).toBe(1);
  });

  it("does not double count revealed dismissed rows", () => {
    const revealed = finding({
      dismissed: true,
      details: { allowlist_field: "user", allowlist_value: "root" },
    });
    const r = response({ results: [revealed], total_findings: 1, dismissed_count: 1 });
    const rows = [
      disposition({ kind: "dismissed", detector: "value_novelty", field: "user", value: "root" }),
    ];
    const cov = computeDetectorCoverage(NOVELTY, r, rows)!;
    expect(cov.coveredVisible).toBe(0);
    expect(cov.reviewed).toBe(1);
  });

  it("marks truncation and keeps reviewed a lower bound", () => {
    const results = Array.from({ length: 50 }, (_, i) =>
      finding({ details: { allowlist_field: "f", allowlist_value: `v${i}` } }),
    );
    const r = response({ results, total_findings: 120, dismissed_count: 3 });
    const cov = computeDetectorCoverage(NOVELTY, r, [])!;
    expect(cov.truncated).toBe(true);
    expect(cov.denominator).toBe(123);
    expect(cov.reviewed).toBe(3);
  });

  it("routine coverage applies to sequence detector findings", () => {
    const gram = "a → b → c";
    const f = finding({ details: { allowlist_field: "message", allowlist_value: gram } });
    const r = response({ detector: "sequence_novelty", results: [f], total_findings: 1 });
    const rows = [
      disposition({ kind: "routine", detector: "sequence_motif", field: "message", value: gram }),
    ];
    const cov = computeDetectorCoverage(SEQUENCE, r, rows)!;
    expect(cov.coveredVisible).toBe(1);
    expect(cov.verdictsByKind.routine).toBe(1);
  });
});

describe("summarizeCoverage", () => {
  it("sums across detectors and propagates truncation", () => {
    const summary = summarizeCoverage({
      novelty: {
        fetched: 1,
        totalFindings: 1,
        dismissed: 1,
        coveredVisible: 0,
        reviewed: 1,
        denominator: 2,
        truncated: false,
        verdictsByKind: { normal: 0, dismissed: 1, confirmed: 0, routine: 0 },
      },
      sequence: {
        fetched: 50,
        totalFindings: 100,
        dismissed: 0,
        coveredVisible: 5,
        reviewed: 5,
        denominator: 100,
        truncated: true,
        verdictsByKind: { normal: 0, dismissed: 0, confirmed: 5, routine: 0 },
      },
      charset: null,
    });
    expect(summary.reviewed).toBe(6);
    expect(summary.denominator).toBe(102);
    expect(summary.anyTruncated).toBe(true);
  });

  it("is zero over empty/null coverages", () => {
    expect(summarizeCoverage({ novelty: null })).toEqual({
      reviewed: 0,
      denominator: 0,
      anyTruncated: false,
    });
  });
});
