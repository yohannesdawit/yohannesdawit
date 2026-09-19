// ---------------------------------------------------------------------------
// Report record (one per grant per reporting period)
// ---------------------------------------------------------------------------

export type ReportStatus = "draft" | "in_review" | "finalized" | "sent";

export interface ReportRecord {
  id: string;
  grant_id: string;
  /** ISO 8601 date (YYYY-MM-DD) */
  period_start: string;
  /** ISO 8601 date (YYYY-MM-DD) */
  period_end: string;
  status: ReportStatus;
  template_id: string;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp, null until finalized */
  finalized_at: string | null;
}

// ---------------------------------------------------------------------------
// Grant metadata
// ---------------------------------------------------------------------------

export interface GrantMetadata {
  grant_id: string;
  name: string;
  donor: string;
  /** ISO 4217 currency code, e.g. "USD" */
  currency: string;
  grant_start: string;
  grant_end: string;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export type MilestoneStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "delayed"
  | "cancelled";

/** Raw milestone record as stored by the grants module. */
export interface MilestoneRecord {
  id: string;
  grant_id: string;
  title: string;
  planned_date: string;
  completed_date: string | null;
  status: MilestoneStatus;
}

/** A milestone as it appears inside an assembled report, with period context. */
export interface MilestoneReportEntry {
  id: string;
  title: string;
  planned_date: string;
  completed_date: string | null;
  status: MilestoneStatus;
  /** True if the planned date or the completed date falls inside the report period. */
  in_period: boolean;
  formatted: {
    planned_date: string;
    completed_date: string;
    status_label: string;
  };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface BudgetLineItem {
  id: string;
  grant_id: string;
  category: string;
  allocated_total: number;
}

/** Portion of a budget line's allocation that applies to a specific period. */
export interface BudgetAllocationSchedule {
  budget_line_id: string;
  period_start: string;
  period_end: string;
  allocated_amount: number;
}

/** A single spend transaction against a budget line. */
export interface BudgetTransaction {
  id: string;
  budget_line_id: string;
  amount: number;
  /** ISO 8601 date the spend occurred */
  date: string;
}

/** A budget line as it appears inside an assembled report, with period figures. */
export interface BudgetLineReportEntry {
  id: string;
  category: string;
  allocated_this_period: number;
  spent_this_period: number;
  /** (spent - allocated) / allocated * 100. Null when allocated is 0 (undefined variance). */
  variance_pct: number | null;
  formatted: {
    allocated: string;
    spent: string;
    variance_pct: string;
    /** e.g. "spent $12,400 of $15,000 allocated" — ready to hand to the AI as-is. */
    summary: string;
  };
}

// ---------------------------------------------------------------------------
// Evidence (once /evidence exists)
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  id: string;
  grant_id: string;
  milestone_id: string | null;
  title: string;
  /** ISO 8601 date the evidence was logged */
  logged_date: string;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Risk flags (once the risk dashboard exists)
// ---------------------------------------------------------------------------

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface RiskFlag {
  id: string;
  grant_id: string;
  milestone_id: string | null;
  title: string;
  description: string;
  severity: RiskSeverity;
  status: "open" | "mitigated" | "closed";
  /** ISO 8601 date the risk was raised */
  raised_date: string;
}

// ---------------------------------------------------------------------------
// Assembled data object — pulled automatically, never AI-generated
// ---------------------------------------------------------------------------

export interface AssembledReportData {
  grant_id: string;
  period_start: string;
  period_end: string;
  prepared_date: string;
  grant: GrantMetadata;
  milestones: {
    planned_in_period: MilestoneReportEntry[];
    completed_in_period: MilestoneReportEntry[];
    all_in_period: MilestoneReportEntry[];
  };
  budget: {
    lines: BudgetLineReportEntry[];
    totals: {
      allocated_this_period: number;
      spent_this_period: number;
      variance_pct: number | null;
      formatted: {
        allocated: string;
        spent: string;
        variance_pct: string;
        summary: string;
      };
    };
  };
  /** Absent until the /evidence module exists. */
  evidence: EvidenceItem[] | null;
  /** Absent until the risk dashboard exists. */
  risks: RiskFlag[] | null;
}
