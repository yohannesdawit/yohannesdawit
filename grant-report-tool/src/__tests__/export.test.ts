import { describe, expect, it } from "vitest";
import { assembleReportData } from "../assemble.js";
import { regenerateSection } from "../narrative.js";
import { finalizeReport, submitForReview } from "../review.js";
import { renderTemplate, TEMPLATE_V1_SECTIONS, type ReportSectionId } from "../template.js";
import { assertExportable, exportReport, renderReportHtml, type ReportExporter } from "../export.js";
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

const AI_SECTION_IDS = TEMPLATE_V1_SECTIONS.filter((s) => s.kind === "ai").map((s) => s.id) as ReportSectionId[];

async function buildFinalizedDraft() {
  const data = await assembleReportData(buildTestSources(), {
    grant_id: GRANT_ID,
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    prepared_date: "2026-04-01",
  });
  let draft = renderTemplate(makeReport(), data);
  draft = { ...draft, report: submitForReview(draft.report) };
  for (const id of AI_SECTION_IDS) {
    if (id === "risks_and_mitigations") continue;
    draft = await regenerateSection(draft, id, async () => `Narrative for ${id}.`);
  }
  return finalizeReport(draft);
}

describe("export guard", () => {
  it("refuses to export a draft or in_review report", async () => {
    const draft = makeReport({ status: "draft" });
    expect(() => assertExportable(draft)).toThrow(/expected "finalized" or "sent"/);
    expect(() => assertExportable({ ...draft, status: "in_review" })).toThrow();
  });

  it("allows exporting finalized and sent reports", () => {
    expect(() => assertExportable(makeReport({ status: "finalized" }))).not.toThrow();
    expect(() => assertExportable(makeReport({ status: "sent" }))).not.toThrow();
  });

  it("exportReport delegates to the exporter only after the guard passes", async () => {
    const draft = await buildFinalizedDraft();
    const fakeBytes = new Uint8Array([1, 2, 3]);
    const exporter: ReportExporter = { format: "pdf", export: async () => fakeBytes };
    const bytes = await exportReport(draft, exporter);
    expect(bytes).toBe(fakeBytes);
  });
});

describe("renderReportHtml", () => {
  it("renders auto and AI sections, visually distinguishing them, and omits inapplicable sections", async () => {
    const draft = await buildFinalizedDraft();
    const html = renderReportHtml(draft);

    expect(html).toContain("Clean Water Initiative");
    expect(html).toContain("section-auto");
    expect(html).toContain("section-ai");
    expect(html).toContain("AI-drafted");
    expect(html).toContain(draft.data.budget.totals.formatted.spent);
    // risks section wasn't applicable in this fixture (no risk data source)
    expect(html).not.toContain('data-section="risks_and_mitigations"');
  });

  it("escapes donor-supplied text to avoid breaking the HTML output", async () => {
    const draft = await buildFinalizedDraft();
    const withMaliciousDonor = {
      ...draft,
      data: { ...draft.data, grant: { ...draft.data.grant, name: '<script>alert(1)</script>' } },
    };
    const html = renderReportHtml(withMaliciousDonor);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
