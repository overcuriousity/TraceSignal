/**
 * fieldDisplay — the single seam between canonical field tokens/values and
 * the text an analyst reads. The invariant under test is that it humanises
 * only what it knows about and passes everything else through untouched:
 * every caller uses the canonical value for keys, sorts and filters, so a
 * fallback that mangled an unknown value would corrupt a chart silently.
 */
import { describe, expect, it } from "vitest";
import {
  fieldTokenLabel,
  fieldValueLabel,
  valueLabeller,
} from "@/components/viz/lib/fieldDisplay";
import { OTHER_KEY, OTHER_LABEL } from "@/components/viz/lib/colors";
import { TIME_FIELDS, TIME_FIELD_PREFIX } from "@/components/viz/lib/timeFields";
import { SCALES } from "@/components/viz/lib/chartMeta";

describe("fieldTokenLabel", () => {
  it("names a virtual time field", () => {
    expect(fieldTokenLabel("time:hour_of_day")).toBe("Hour of day (UTC)");
    expect(fieldTokenLabel("time:day_of_week")).toBe("Day of week (UTC)");
  });

  it("passes an ordinary field token through unchanged", () => {
    expect(fieldTokenLabel("artifact")).toBe("artifact");
  });

  it("keeps the attr: prefix, which distinguishes a raw key from a mapping", () => {
    // `attr:src_ip` and a mapped canonical `src_ip` can both be in the viz
    // inventory; stripping would render them identically.
    expect(fieldTokenLabel("attr:src_ip")).toBe("attr:src_ip");
  });
});

describe("fieldValueLabel", () => {
  it("humanises a value that has a display map", () => {
    expect(fieldValueLabel("time:day_of_week", "1")).toBe("Mon");
    expect(fieldValueLabel("time:day_of_week", "7")).toBe("Sun");
    expect(fieldValueLabel("time:month", "02")).toBe("Feb");
    expect(fieldValueLabel("time:hour_of_day", "09")).toBe("09:00");
  });

  it("passes through a time field that has no display map", () => {
    // time:day_of_month is zero-padded but not relabelled.
    expect(fieldValueLabel("time:day_of_month", "02")).toBe("02");
    expect(fieldValueLabel("time:date", "2026-07-20")).toBe("2026-07-20");
  });

  it("falls back to the raw value for an unknown token or value", () => {
    expect(fieldValueLabel("artifact", "FILE")).toBe("FILE");
    expect(fieldValueLabel(null, "FILE")).toBe("FILE");
    expect(fieldValueLabel(undefined, "FILE")).toBe("FILE");
    // Outside the domain — must not become "undefined".
    expect(fieldValueLabel("time:day_of_week", "99")).toBe("99");
  });

  it("resolves the Other sentinel without colliding with a real value", () => {
    expect(fieldValueLabel("artifact", OTHER_KEY)).toBe(OTHER_LABEL);
    // A field value that is literally the string "Other" is not the sentinel.
    expect(fieldValueLabel("artifact", "Other")).toBe("Other");
  });

  it("resolves the sentinel even for a field with a display map", () => {
    expect(fieldValueLabel("time:day_of_week", OTHER_KEY)).toBe(OTHER_LABEL);
  });
});

describe("valueLabeller", () => {
  it("is fieldValueLabel bound to one field", () => {
    const label = valueLabeller("time:month");
    expect(label("01")).toBe("Jan");
    expect(label(OTHER_KEY)).toBe(OTHER_LABEL);
  });
});

describe("TIME_FIELDS generated contract", () => {
  // timeFields.ts is generated from src/vestigo/db/_time_fields.py. These
  // assertions catch a bad generator run without restating its fixtures.
  it("namespaces every token and declares a known scale", () => {
    for (const [token, meta] of Object.entries(TIME_FIELDS)) {
      expect(token.startsWith(TIME_FIELD_PREFIX)).toBe(true);
      expect(SCALES).toContain(meta.scale);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it("labels exactly the values in its domain, where it labels any", () => {
    for (const [token, meta] of Object.entries(TIME_FIELDS)) {
      if (meta.display == null) continue;
      expect(meta.domain, `${token} has a display map but no domain`).not.toBeNull();
      expect(Object.keys(meta.display).sort()).toEqual([...meta.domain!].sort());
    }
  });

  it("keeps display labels injective, so a label maps back to one value", () => {
    // Legend and axis code keys React children on the label in places; two
    // values collapsing to one label would collide.
    for (const [token, meta] of Object.entries(TIME_FIELDS)) {
      if (meta.display == null) continue;
      const labels = Object.values(meta.display);
      expect(new Set(labels).size, `${token} has duplicate display labels`).toBe(labels.length);
    }
  });
});
