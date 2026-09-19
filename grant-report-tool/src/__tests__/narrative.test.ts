import { describe, expect, it } from "vitest";
import { assembleReportData } from "../assemble.js";
import {
  buildBudgetNarrativeContext,
  buildPrompt,
  buildProgressSummaryContext,
  regenerateSection,
  type NarrativePromptContext,
} from "../narrative.js";
import { renderTemplate } from "../template.js";
import type { ReportRecord } from "../types.js";
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

describe("narrative context builders", () => {
  it("passes budget facts as the exact same formatted strings used in the auto-rendered table", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const context = buildBudgetNarrativeContext(data);
    expect(context.facts.total_summary).toBe(data.budget.totals.formatted.summary);
    for (const line of data.budget.lines) {
      expect(context.facts[`line_${line.category}`]).toBe(line.formatted.summary);
    }
  });

  it("every fact value is a string — the type system leaves no way to hand the model a raw number", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const context = buildProgressSummaryContext(data);
    for (const value of Object.values(context.facts)) {
      expect(typeof value).toBe("string");
    }
  });

  it("buildPrompt states the numbers-never-generated rule and lists every fact", async () => {
    const context: NarrativePromptContext = {
      sectionId: "budget_narrative",
      instructions: "Write a narrative.",
      facts: { total_summary: "spent $17,600.00 of $20,000.00 allocated (-12.0% variance)" },
    };
    const prompt = buildPrompt(context);
    expect(prompt).toContain("never compute, round, estimate, or state a number");
    expect(prompt).toContain("total_summary: spent $17,600.00 of $20,000.00 allocated (-12.0% variance)");
  });
});

describe("regenerateSection", () => {
  it("regenerates only the targeted section, leaving every other section untouched", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);

    const updated = await regenerateSection(draft, "progress_summary", async (context) => {
      expect(context.sectionId).toBe("progress_summary");
      return "Milestones progressed well this quarter.";
    });

    const progress = updated.sections.find((s) => s.id === "progress_summary")!;
    expect(progress.kind).toBe("ai");
    if (progress.kind === "ai") {
      expect(progress.content.status).toBe("generated");
      expect(progress.content.text).toBe("Milestones progressed well this quarter.");
      expect(progress.content.generated_at).not.toBeNull();
    }

    const budgetNarrative = updated.sections.find((s) => s.id === "budget_narrative")!;
    if (budgetNarrative.kind === "ai") {
      expect(budgetNarrative.content.status).toBe("not_generated");
    }

    // original draft object is untouched (immutable update)
    const originalProgress = draft.sections.find((s) => s.id === "progress_summary")!;
    if (originalProgress.kind === "ai") {
      expect(originalProgress.content.status).toBe("not_generated");
    }
  });

  it("refuses to regenerate a non-AI section", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport(), data);
    await expect(regenerateSection(draft, "header", async () => "nope")).rejects.toThrow(
      /not an AI-narrated section/,
    );
  });

  it("refuses to regenerate once the report is finalized", async () => {
    const data = await assembleReportData(buildTestSources(), {
      grant_id: GRANT_ID,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    });
    const draft = renderTemplate(makeReport({ status: "finalized" }), data);
    await expect(regenerateSection(draft, "progress_summary", async () => "text")).rejects.toThrow(
      /finalized/,
    );
  });
});
