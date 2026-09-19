import type { DraftReport, DraftReportSectionAi, ReportSectionId } from "./template.js";
import type { ReportRecord, ReportStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Status state machine
//
//   draft --submit--> in_review --finalize--> finalized --send--> sent
//            ^             |
//            +---send_back-+
//
// finalized and sent are terminal except for the single finalized->sent step;
// nothing about a finalized report's narrative or numbers can change after
// that point.
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "finalized"],
  finalized: ["sent"],
  sent: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function transitionReport(report: ReportRecord, to: ReportStatus): ReportRecord {
  if (!canTransition(report.status, to)) {
    throw new Error(`Cannot transition report from "${report.status}" to "${to}"`);
  }
  return { ...report, status: to };
}

export function submitForReview(report: ReportRecord): ReportRecord {
  return transitionReport(report, "in_review");
}

export function sendBackToDraft(draft: DraftReport): DraftReport {
  return { ...draft, report: transitionReport(draft.report, "draft") };
}

/**
 * Finalizes a report. Refuses if any applicable AI section still lacks
 * narrative — a finalized, donor-facing report should never ship with an
 * empty section. Auto-pulled sections (header, tables) are always ready
 * since they never depend on generation.
 */
export function finalizeReport(draft: DraftReport): DraftReport {
  if (draft.report.status !== "in_review") {
    throw new Error(`Cannot finalize report: status is "${draft.report.status}", expected "in_review"`);
  }

  const incomplete = draft.sections.filter(
    (s): s is DraftReportSectionAi => s.kind === "ai" && s.applicable && s.content.status === "not_generated",
  );
  if (incomplete.length > 0) {
    throw new Error(
      `Cannot finalize report: these sections still need narrative — ${incomplete
        .map((s) => s.title)
        .join(", ")}`,
    );
  }

  const report: ReportRecord = {
    ...transitionReport(draft.report, "finalized"),
    finalized_at: new Date().toISOString(),
  };
  return { ...draft, report };
}

export function markReportSent(draft: DraftReport): DraftReport {
  return { ...draft, report: transitionReport(draft.report, "sent") };
}

// ---------------------------------------------------------------------------
// Human review edits
// ---------------------------------------------------------------------------

/**
 * Applies a human edit to an AI-drafted section's text. Only "ai" sections
 * are editable this way — auto-pulled sections (header, tables) are never
 * hand-edited; if their numbers are wrong, the fix belongs upstream in the
 * data sources, not in the report.
 */
export function applyHumanEdit(draft: DraftReport, sectionId: ReportSectionId, newText: string): DraftReport {
  if (draft.report.status === "finalized" || draft.report.status === "sent") {
    throw new Error(`Cannot edit "${sectionId}": report is ${draft.report.status}`);
  }

  const index = draft.sections.findIndex((s) => s.id === sectionId);
  const section = draft.sections[index];
  if (index === -1 || !section || section.kind !== "ai") {
    throw new Error(`"${sectionId}" is not an editable AI section`);
  }

  const updated: DraftReportSectionAi = {
    ...section,
    content: {
      ...section.content,
      text: newText,
      status: "edited_by_human",
      edited_at: new Date().toISOString(),
    },
  };

  const sections = [...draft.sections];
  sections[index] = updated;
  return { ...draft, sections };
}
