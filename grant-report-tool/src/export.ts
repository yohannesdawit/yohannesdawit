import type {
  BudgetTableSectionContent,
  DraftReport,
  HeaderSectionContent,
  MilestoneTableSectionContent,
} from "./template.js";
import type { ReportRecord } from "./types.js";

export type ExportFormat = "pdf" | "docx";

/**
 * Only a finalized (or already-sent) report can be exported — a draft or
 * in-review report may still have empty or stale AI sections.
 */
export function assertExportable(report: ReportRecord): void {
  if (report.status !== "finalized" && report.status !== "sent") {
    throw new Error(`Cannot export report: status is "${report.status}", expected "finalized" or "sent"`);
  }
}

/**
 * Renders a finalized report to bytes in the given format. PDF is v1;
 * docx is a fast-follow. Concrete implementations (e.g. a headless-browser
 * PDF renderer, or a docx template engine) are pluggable — this module
 * only defines the contract and the shared HTML precursor both formats
 * can be built from.
 */
export interface ReportExporter {
  format: ExportFormat;
  export(draft: DraftReport): Promise<Uint8Array>;
}

export async function exportReport(draft: DraftReport, exporter: ReportExporter): Promise<Uint8Array> {
  assertExportable(draft.report);
  return exporter.export(draft);
}

// ---------------------------------------------------------------------------
// HTML rendering — a dependency-free, donor-ready precursor that a PDF
// exporter (e.g. headless Chromium) or a docx converter can consume.
// AI-drafted sections are visually distinguished from auto-pulled ones.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHeader(content: HeaderSectionContent): string {
  return `
    <section class="section section-auto" data-section="header">
      <h1>${escapeHtml(content.grant_name)}</h1>
      <dl>
        <dt>Donor</dt><dd>${escapeHtml(content.donor)}</dd>
        <dt>Reporting period</dt><dd>${escapeHtml(content.reporting_period)}</dd>
        <dt>Prepared</dt><dd>${escapeHtml(content.prepared_date)}</dd>
      </dl>
    </section>`;
}

function renderMilestoneTable(title: string, content: MilestoneTableSectionContent): string {
  const rows = content.rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.title)}</td>
        <td>${escapeHtml(r.planned_date)}</td>
        <td>${escapeHtml(r.completed_date)}</td>
        <td>${escapeHtml(r.status_label)}</td>
      </tr>`,
    )
    .join("\n");
  return `
    <section class="section section-auto" data-section="milestone_table">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr><th>Milestone</th><th>Planned</th><th>Completed</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderBudgetTable(title: string, content: BudgetTableSectionContent): string {
  const rows = content.rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.allocated)}</td>
        <td>${escapeHtml(r.spent)}</td>
        <td>${escapeHtml(r.variance_pct)}</td>
      </tr>`,
    )
    .join("\n");
  return `
    <section class="section section-auto" data-section="budget_table">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr><th>Category</th><th>Allocated</th><th>Spent</th><th>Variance</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>${escapeHtml(content.totals.category)}</td>
          <td>${escapeHtml(content.totals.allocated)}</td>
          <td>${escapeHtml(content.totals.spent)}</td>
          <td>${escapeHtml(content.totals.variance_pct)}</td>
        </tr></tfoot>
      </table>
    </section>`;
}

export function renderReportHtml(draft: DraftReport): string {
  const body = draft.sections
    .filter((s) => s.applicable)
    .map((section) => {
      if (section.kind === "auto") {
        switch (section.id) {
          case "header":
            return renderHeader(section.content as HeaderSectionContent);
          case "milestone_table":
            return renderMilestoneTable(section.title, section.content as MilestoneTableSectionContent);
          case "budget_table":
            return renderBudgetTable(section.title, section.content as BudgetTableSectionContent);
          default:
            return "";
        }
      }
      const badge = section.content.status === "edited_by_human" ? "AI-drafted, human-edited" : "AI-drafted";
      const text = section.content.text ?? "";
      return `
        <section class="section section-ai" data-section="${section.id}">
          <h2>${escapeHtml(section.title)} <span class="badge">${badge}</span></h2>
          <p>${escapeHtml(text)}</p>
        </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(draft.data.grant.name)} — Grant Report</title></head>
<body>
${body}
</body>
</html>`;
}
