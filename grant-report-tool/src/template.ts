import { formatDate } from "./format.js";
import type { AssembledReportData, ReportRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Section identity & template definition (v1)
// ---------------------------------------------------------------------------

export type ReportSectionId =
  | "header"
  | "progress_summary"
  | "milestone_table"
  | "budget_narrative"
  | "budget_table"
  | "risks_and_mitigations"
  | "next_period_outlook";

/** "auto" sections are rendered directly from the assembled data — no AI involved.
 *  "ai" sections start empty and are filled by the narrative layer (see narrative.ts). */
export type SectionKind = "auto" | "ai";

export interface TemplateSectionDefinition {
  id: ReportSectionId;
  title: string;
  kind: SectionKind;
  order: number;
  /** For optional sections (e.g. risks, which depend on a module that may not exist yet). */
  isApplicable: (data: AssembledReportData) => boolean;
}

export const TEMPLATE_V1_ID = "v1";

export const TEMPLATE_V1_SECTIONS: TemplateSectionDefinition[] = [
  { id: "header", title: "Header", kind: "auto", order: 1, isApplicable: () => true },
  { id: "progress_summary", title: "Progress Summary", kind: "ai", order: 2, isApplicable: () => true },
  { id: "milestone_table", title: "Milestone Table", kind: "auto", order: 3, isApplicable: () => true },
  { id: "budget_narrative", title: "Budget Narrative", kind: "ai", order: 4, isApplicable: () => true },
  { id: "budget_table", title: "Budget Table", kind: "auto", order: 5, isApplicable: () => true },
  {
    id: "risks_and_mitigations",
    title: "Risks & Mitigations",
    kind: "ai",
    order: 6,
    isApplicable: (data) => data.risks !== null && data.risks.length > 0,
  },
  { id: "next_period_outlook", title: "Next Period Outlook", kind: "ai", order: 7, isApplicable: () => true },
];

// ---------------------------------------------------------------------------
// Auto section content shapes — built directly from AssembledReportData
// ---------------------------------------------------------------------------

export interface HeaderSectionContent {
  grant_name: string;
  donor: string;
  reporting_period: string;
  prepared_date: string;
}

export interface MilestoneTableRow {
  title: string;
  planned_date: string;
  completed_date: string;
  status_label: string;
}

export interface MilestoneTableSectionContent {
  rows: MilestoneTableRow[];
}

export interface BudgetTableRow {
  category: string;
  allocated: string;
  spent: string;
  variance_pct: string;
}

export interface BudgetTableSectionContent {
  rows: BudgetTableRow[];
  totals: BudgetTableRow;
}

export type AutoSectionContent =
  | HeaderSectionContent
  | MilestoneTableSectionContent
  | BudgetTableSectionContent;

// ---------------------------------------------------------------------------
// AI section content shape — starts empty; see narrative.ts for how it's filled
// ---------------------------------------------------------------------------

export type NarrativeSectionStatus = "not_generated" | "generating" | "generated" | "edited_by_human";

export interface NarrativeSectionContent {
  status: NarrativeSectionStatus;
  text: string | null;
  generated_at: string | null;
  edited_at: string | null;
}

// ---------------------------------------------------------------------------
// Draft report — the editable, section-by-section working document
// ---------------------------------------------------------------------------

export interface DraftReportSectionAuto {
  id: ReportSectionId;
  title: string;
  kind: "auto";
  order: number;
  applicable: true;
  content: AutoSectionContent;
}

export interface DraftReportSectionAi {
  id: ReportSectionId;
  title: string;
  kind: "ai";
  order: number;
  /** false when the section's data isn't available yet (e.g. no risk dashboard) — kept out of exports. */
  applicable: boolean;
  content: NarrativeSectionContent;
}

export type DraftReportSection = DraftReportSectionAuto | DraftReportSectionAi;

export interface DraftReport {
  report: ReportRecord;
  data: AssembledReportData;
  sections: DraftReportSection[];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function reportingPeriodLabel(data: AssembledReportData): string {
  return `${formatDate(data.period_start)} – ${formatDate(data.period_end)}`;
}

function renderHeader(data: AssembledReportData): HeaderSectionContent {
  return {
    grant_name: data.grant.name,
    donor: data.grant.donor,
    reporting_period: reportingPeriodLabel(data),
    prepared_date: formatDate(data.prepared_date),
  };
}

function renderMilestoneTable(data: AssembledReportData): MilestoneTableSectionContent {
  return {
    rows: data.milestones.all_in_period.map((m) => ({
      title: m.title,
      planned_date: m.formatted.planned_date,
      completed_date: m.formatted.completed_date,
      status_label: m.formatted.status_label,
    })),
  };
}

function renderBudgetTable(data: AssembledReportData): BudgetTableSectionContent {
  return {
    rows: data.budget.lines.map((l) => ({
      category: l.category,
      allocated: l.formatted.allocated,
      spent: l.formatted.spent,
      variance_pct: l.formatted.variance_pct,
    })),
    totals: {
      category: "Total",
      allocated: data.budget.totals.formatted.allocated,
      spent: data.budget.totals.formatted.spent,
      variance_pct: data.budget.totals.formatted.variance_pct,
    },
  };
}

const emptyNarrative: NarrativeSectionContent = {
  status: "not_generated",
  text: null,
  generated_at: null,
  edited_at: null,
};

/** Renders a fresh draft report: auto sections filled, AI sections empty pending generation. */
export function renderTemplate(report: ReportRecord, data: AssembledReportData): DraftReport {
  const sections: DraftReportSection[] = TEMPLATE_V1_SECTIONS.map((def) => {
    const applicable = def.isApplicable(data);
    if (def.kind === "auto") {
      const content = renderAutoSection(def.id, data);
      return { id: def.id, title: def.title, kind: "auto", order: def.order, applicable: true, content };
    }
    return {
      id: def.id,
      title: def.title,
      kind: "ai",
      order: def.order,
      applicable,
      content: { ...emptyNarrative },
    };
  });

  return { report, data, sections: sections.sort((a, b) => a.order - b.order) };
}

function renderAutoSection(id: ReportSectionId, data: AssembledReportData): AutoSectionContent {
  switch (id) {
    case "header":
      return renderHeader(data);
    case "milestone_table":
      return renderMilestoneTable(data);
    case "budget_table":
      return renderBudgetTable(data);
    default:
      throw new Error(`${id} is not an auto-rendered section`);
  }
}
