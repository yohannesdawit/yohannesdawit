import { describe, expect, it } from "vitest";
import { assembleReportData } from "../assemble.js";
import { regenerateSection } from "../narrative.js";
import {
  applyHumanEdit,
  finalizeReport,
  markReportSent,
  sendBackToDraft,
  submitForReview,
} from "../review.js";
import { renderTemplate, TEMPLATE_V1_SECTIONS, type ReportSectionId } from "../template.js";
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

async function buildDraft(status: ReportRecord["status"] = "draft") {
  const data = await assembleReportData(buildTestSources(), {
    grant_id: GRANT_ID,
    period_start: PERIOD_START,
    period_end: PERIOD_END,
  });
  return renderTemplate(makeReport({ status }), data);
}

const AI_SECTION_IDS = TEMPLATE_V1_SECTIONS.filter((s) => s.kind === "ai").map((s) => s.id) as ReportSectionId[];

describe("review state machine", () => {
  it("walks draft -> in_review -> finalized -> sent", async () => {
    let draft = await buildDraft("draft");
    draft = { ...draft, report: submitForReview(draft.report) };
    expect(draft.report.status).toBe("in_review");

    for (const id of AI_SECTION_IDS) {
      if (id === "risks_and_mitigations") continue; // not applicable in this fixture
      draft = await regenerateSection(draft, id, async () => "Narrative text.");
    }

    draft = finalizeReport(draft);
    expect(draft.report.status).toBe("finalized");
    expect(draft.report.finalized_at).not.toBeNull();

    draft = markReportSent(draft);
    expect(draft.report.status).toBe("sent");
  });

  it("refuses to finalize while an applicable AI section is still empty", async () => {
    let draft = await buildDraft("draft");
    draft = { ...draft, report: submitForReview(draft.report) };
    expect(() => finalizeReport(draft)).toThrow(/still need narrative/);
  });

  it("refuses to submit-for-review a report that isn't a draft", async () => {
    const draft = await buildDraft("finalized");
    expect(() => submitForReview(draft.report)).toThrow(/Cannot transition/);
  });

  it("allows sending a report back from in_review to draft for more edits", async () => {
    let draft = await buildDraft("draft");
    draft = { ...draft, report: submitForReview(draft.report) };
    draft = sendBackToDraft(draft);
    expect(draft.report.status).toBe("draft");
  });

  it("lets a human edit an AI-drafted section, tracked separately from generation", async () => {
    let draft = await buildDraft("draft");
    draft = await regenerateSection(draft, "progress_summary", async () => "Original narrative.");
    draft = applyHumanEdit(draft, "progress_summary", "Edited narrative for tone.");

    const section = draft.sections.find((s) => s.id === "progress_summary")!;
    if (section.kind === "ai") {
      expect(section.content.text).toBe("Edited narrative for tone.");
      expect(section.content.status).toBe("edited_by_human");
      expect(section.content.edited_at).not.toBeNull();
    }
  });

  it("refuses to edit a section once the report is finalized", async () => {
    const draft = await buildDraft("finalized");
    expect(() => applyHumanEdit(draft, "progress_summary", "too late")).toThrow(/finalized/);
  });

  it("refuses to edit an auto-pulled section — fixes belong upstream in the data", async () => {
    const draft = await buildDraft("draft");
    expect(() => applyHumanEdit(draft, "budget_table", "made up numbers")).toThrow(
      /not an editable AI section/,
    );
  });
});
