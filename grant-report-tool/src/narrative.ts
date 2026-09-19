import type { AssembledReportData } from "./types.js";
import type { DraftReport, DraftReportSectionAi, ReportSectionId } from "./template.js";

// ---------------------------------------------------------------------------
// The hard rule: numbers never come from the model.
//
// NarrativePromptContext.facts is a Record<string, string> — by construction
// it can only ever hold pre-formatted strings, never a `number`. Every string
// in it is produced by format.ts from the assembled data, so the AI has
// nothing to compute: it can only copy a fact verbatim into a sentence. If a
// context builder below tries to pass a raw number, TypeScript rejects it.
// ---------------------------------------------------------------------------

export interface NarrativePromptContext {
  sectionId: ReportSectionId;
  /** What the model is being asked to write. */
  instructions: string;
  /** Every fact the model may reference, already formatted as a string. */
  facts: Record<string, string>;
}

const NUMBERS_RULE =
  "Use only the facts listed below. Every figure, date, and percentage in your narrative must be " +
  "copied verbatim from these facts — never compute, round, estimate, or state a number that is not " +
  "written here. If a fact is missing, say the information isn't available rather than guessing.";

/** Assembles a context into the literal prompt string to send to the model. */
export function buildPrompt(context: NarrativePromptContext): string {
  const factLines = Object.entries(context.facts)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
  return [context.instructions, "", NUMBERS_RULE, "", "Facts:", factLines].join("\n");
}

// ---------------------------------------------------------------------------
// Per-section context builders — each pulls only .formatted strings (or
// plain labels/titles) out of AssembledReportData, never a numeric field.
// ---------------------------------------------------------------------------

export function buildProgressSummaryContext(data: AssembledReportData): NarrativePromptContext {
  const facts: Record<string, string> = {
    grant_name: data.grant.name,
    donor: data.grant.donor,
    reporting_period: `${data.period_start} to ${data.period_end}`,
    milestones_planned_this_period: String(data.milestones.planned_in_period.length),
    milestones_completed_this_period: String(data.milestones.completed_in_period.length),
  };
  data.milestones.all_in_period.forEach((m, i) => {
    facts[`milestone_${i + 1}`] =
      `${m.title} — ${m.formatted.status_label} (planned ${m.formatted.planned_date}, completed ${m.formatted.completed_date})`;
  });
  return {
    sectionId: "progress_summary",
    instructions:
      "Write a short narrative (2-4 sentences) synthesizing overall milestone progress this reporting period for a donor audience.",
    facts,
  };
}

export function buildBudgetNarrativeContext(data: AssembledReportData): NarrativePromptContext {
  const facts: Record<string, string> = {
    total_summary: data.budget.totals.formatted.summary,
  };
  data.budget.lines.forEach((line) => {
    facts[`line_${line.category}`] = line.formatted.summary;
  });
  return {
    sectionId: "budget_narrative",
    instructions:
      "Write a short narrative (2-4 sentences) explaining spend versus allocation this period, calling out any " +
      "notable variances and why they might matter to the donor.",
    facts,
  };
}

export function buildRisksContext(data: AssembledReportData): NarrativePromptContext {
  const facts: Record<string, string> = {};
  (data.risks ?? []).forEach((risk, i) => {
    facts[`risk_${i + 1}`] = `${risk.title} (${risk.severity}, raised ${risk.raised_date}): ${risk.description}`;
  });
  return {
    sectionId: "risks_and_mitigations",
    instructions:
      "Summarize the open risks below and their mitigations for a donor audience. Only discuss risks listed in " +
      "the facts — never infer or invent a risk that isn't logged.",
    facts,
  };
}

export function buildOutlookContext(data: AssembledReportData): NarrativePromptContext {
  const inProgressOrDelayed = data.milestones.all_in_period.filter(
    (m) => m.status === "in_progress" || m.status === "delayed",
  );
  const facts: Record<string, string> = {
    budget_variance_summary: data.budget.totals.formatted.summary,
    milestones_still_open_this_period: String(inProgressOrDelayed.length),
  };
  inProgressOrDelayed.forEach((m, i) => {
    facts[`open_milestone_${i + 1}`] = `${m.title} — ${m.formatted.status_label} (planned ${m.formatted.planned_date})`;
  });
  return {
    sectionId: "next_period_outlook",
    instructions: "Write a short, forward-looking outlook (2-3 sentences) for the next reporting period.",
    facts,
  };
}

const CONTEXT_BUILDERS: Partial<Record<ReportSectionId, (data: AssembledReportData) => NarrativePromptContext>> = {
  progress_summary: buildProgressSummaryContext,
  budget_narrative: buildBudgetNarrativeContext,
  risks_and_mitigations: buildRisksContext,
  next_period_outlook: buildOutlookContext,
};

export function buildNarrativeContext(sectionId: ReportSectionId, data: AssembledReportData): NarrativePromptContext {
  const builder = CONTEXT_BUILDERS[sectionId];
  if (!builder) throw new Error(`${sectionId} is not an AI-narrated section`);
  return builder(data);
}

// ---------------------------------------------------------------------------
// Generation — pluggable so this module never hardcodes a specific provider.
// ---------------------------------------------------------------------------

export type NarrativeGenerator = (context: NarrativePromptContext) => Promise<string>;

/**
 * Regenerates a single AI section in place, leaving every other section
 * (and all auto-pulled data) untouched. Throws if the report is already
 * finalized/sent — a finalized report's narrative is frozen.
 */
export async function regenerateSection(
  draft: DraftReport,
  sectionId: ReportSectionId,
  generate: NarrativeGenerator,
): Promise<DraftReport> {
  if (draft.report.status === "finalized" || draft.report.status === "sent") {
    throw new Error(`Cannot regenerate "${sectionId}": report is ${draft.report.status}`);
  }

  const sectionIndex = draft.sections.findIndex((s) => s.id === sectionId);
  if (sectionIndex === -1) throw new Error(`Unknown section: ${sectionId}`);
  const section = draft.sections[sectionIndex];
  if (!section || section.kind !== "ai") {
    throw new Error(`"${sectionId}" is not an AI-narrated section and cannot be regenerated`);
  }

  const context = buildNarrativeContext(sectionId, draft.data);
  const text = await generate(context);

  const updatedSection: DraftReportSectionAi = {
    ...section,
    content: {
      status: "generated",
      text,
      generated_at: new Date().toISOString(),
      edited_at: null,
    },
  };

  const sections = [...draft.sections];
  sections[sectionIndex] = updatedSection;
  return { ...draft, sections };
}
