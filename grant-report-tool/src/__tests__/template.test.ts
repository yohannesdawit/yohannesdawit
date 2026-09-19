import { describe, expect, it } from "vitest";
import { assembleReportData } from "../assemble.js";
import { InMemoryRiskRepository } from "../dataSources.js";
import {
  renderTemplate,
  TEMPLATE_V1_SECTIONS,
  type BudgetTableSectionContent,
  type HeaderSectionContent,
  type MilestoneTableSectionContent,
} from "../template.js";
import type { ReportRecord, RiskFlag } from "../types.js";
import { buildTestSources, GRANT_ID, PERIOD_END, PERIOD_START } from "./fixtures.js";

function makeReport(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "r1",
    grant_id: GRANT_ID,
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    status: "draft",
    template_id: "v1",
    created_at: "2026-04-01T00:00:00Z",
    finalized_at: null,
    ...overrides,
  };
}

describe("renderTemplate", () => {
  it("produces all seven v1 sections in order", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);
    expect(draft.sections.map((s) => s.id)).toEqual(TEMPLATE_V1_SECTIONS.map((d) => d.id));
    expect(draft.sections.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("fills auto sections directly from assembled data, no AI involved", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      prepared_date: "2026-04-01",
    });
    const draft = renderTemplate(makeReport(), data);

    const header = draft.sections.find((s) => s.id === "header")!;
    expect(header.kind).toBe("auto");
    const headerContent = header.content as HeaderSectionContent;
    expect(headerContent.grant_name).toBe("Clean Water Initiative");
    expect(headerContent.donor).toBe("Acme Foundation");

    const milestoneTable = draft.sections.find((s) => s.id === "milestone_table")!;
    const milestoneRows = (milestoneTable.content as MilestoneTableSectionContent).rows;
    expect(milestoneRows).toHaveLength(2);

    const budgetTable = draft.sections.find((s) => s.id === "budget_table")!;
    const budgetContent = budgetTable.content as BudgetTableSectionContent;
    expect(budgetContent.rows).toHaveLength(2);
    expect(budgetContent.totals.category).toBe("Total");
  });

  it("leaves AI sections empty pending generation", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);
    const aiSections = draft.sections.filter((s) => s.kind === "ai");
    expect(aiSections.length).toBeGreaterThan(0);
    for (const s of aiSections) {
      if (s.kind !== "ai") continue;
      expect(s.content.status).toBe("not_generated");
      expect(s.content.text).toBeNull();
    }
  });

  it("marks the risks section inapplicable when no risk data source is wired up", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);
    const risks = draft.sections.find((s) => s.id === "risks_and_mitigations")!;
    expect(risks.applicable).toBe(false);
  });

  it("marks the risks section applicable once open risks exist for the period", async () => {
    const openRisk: RiskFlag = {
      id: "risk1",
      grant_id: GRANT_ID,
      milestone_id: null,
      title: "Permit delay",
      description: "Local permitting office has not yet approved drilling.",
      severity: "medium",
      status: "open",
      raised_date: "2026-02-01",
    };
    const sources = { ...buildTestSources(), risks: new InMemoryRiskRepository([openRisk]) };
    const data = await assembleReportData(sources, {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);
    const risks = draft.sections.find((s) => s.id === "risks_and_mitigations")!;
    expect(risks.applicable).toBe(true);
  });
});
