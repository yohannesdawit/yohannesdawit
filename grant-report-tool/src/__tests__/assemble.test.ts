import { describe, expect, it } from "vitest";
import { assembleReportData } from "../assemble.js";
import { formatCurrency, formatPercent } from "../format.js";
import { buildTestSources, EXPECTED, GRANT_ID, PERIOD_END, PERIOD_START } from "./fixtures.js";

describe("assembleReportData", () => {
  it("pulls grant metadata verbatim", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      prepared_date: "2026-04-01",
    });
    expect(data.grant.name).toBe("Clean Water Initiative");
    expect(data.grant.donor).toBe("Acme Foundation");
    expect(data.grant.currency).toBe("USD");
    expect(data.prepared_date).toBe("2026-04-01");
  });

  it("buckets milestones by planned/completed/all within the period", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    expect(data.milestones.all_in_period.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    expect(data.milestones.completed_in_period.map((m) => m.id)).toEqual(["m1"]);
    expect(data.milestones.planned_in_period.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    // m3 is planned well after the period and must not leak in
    expect(data.milestones.all_in_period.some((m) => m.id === "m3")).toBe(false);
  });

  it("computes allocated/spent/variance per budget line from the period-scoped source data", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const l1 = data.budget.lines.find((l) => l.id === "l1")!;
    const l2 = data.budget.lines.find((l) => l.id === "l2")!;

    expect(l1.allocated_this_period).toBe(EXPECTED.l1AllocatedThisPeriod);
    expect(l1.spent_this_period).toBe(EXPECTED.l1SpentThisPeriod);
    expect(l1.variance_pct).toBeCloseTo(((12400 - 15000) / 15000) * 100, 5);
    expect(l1.formatted.allocated).toBe(formatCurrency(15000, "USD"));
    expect(l1.formatted.spent).toBe(formatCurrency(12400, "USD"));

    expect(l2.allocated_this_period).toBe(EXPECTED.l2AllocatedThisPeriod);
    expect(l2.spent_this_period).toBe(EXPECTED.l2SpentThisPeriod);
    expect(l2.variance_pct).toBeCloseTo(((5200 - 5000) / 5000) * 100, 5);
  });

  it("rolls budget lines up into period totals", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    expect(data.budget.totals.allocated_this_period).toBe(EXPECTED.totalAllocated);
    expect(data.budget.totals.spent_this_period).toBe(EXPECTED.totalSpent);
    expect(data.budget.totals.variance_pct).toBeCloseTo(((17600 - 20000) / 20000) * 100, 5);
    expect(data.budget.totals.formatted.variance_pct).toBe(
      formatPercent(((17600 - 20000) / 20000) * 100),
    );
  });

  it("leaves evidence and risks null when their data sources aren't wired up yet", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    expect(data.evidence).toBeNull();
    expect(data.risks).toBeNull();
  });

  it("treats a zero-allocation line as undefined variance rather than dividing by zero", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    // no allocations or transactions exist for this period, so both budget lines are all-zero
    for (const line of data.budget.lines) {
      expect(line.allocated_this_period).toBe(0);
      expect(line.spent_this_period).toBe(0);
      expect(line.variance_pct).toBeNull();
      expect(line.formatted.variance_pct).toBe("n/a");
    }
  });
});
