import type { ReportDataSources } from "./dataSources.js";
import {
  computeVariancePct,
  formatBudgetSummary,
  formatCurrency,
  formatDate,
  formatMilestoneStatus,
  formatPercent,
  isWithinPeriod,
} from "./format.js";
import type {
  AssembledReportData,
  BudgetLineReportEntry,
  MilestoneReportEntry,
} from "./types.js";

export interface AssembleParams {
  grant_id: string;
  period_start: string;
  period_end: string;
  /** Defaults to today (UTC, ISO date) if omitted. */
  prepared_date?: string;
}

/**
 * Pulls a grant's data for a reporting period into a structured object.
 * Pure plumbing: no AI, no narrative — every number here is the number that
 * ends up in the final report.
 */
export async function assembleReportData(
  sources: ReportDataSources,
  params: AssembleParams,
): Promise<AssembledReportData> {
  const { grant_id, period_start, period_end } = params;
  const prepared_date = params.prepared_date ?? new Date().toISOString().slice(0, 10);

  const grant = await sources.grants.getGrant(grant_id);

  const milestoneRecords = await sources.milestones.listMilestonesForGrant(grant_id);
  const milestoneEntries: MilestoneReportEntry[] = milestoneRecords.map((m) => {
    const plannedInPeriod = isWithinPeriod(m.planned_date, period_start, period_end);
    const completedInPeriod = m.completed_date
      ? isWithinPeriod(m.completed_date, period_start, period_end)
      : false;
    return {
      id: m.id,
      title: m.title,
      planned_date: m.planned_date,
      completed_date: m.completed_date,
      status: m.status,
      in_period: plannedInPeriod || completedInPeriod,
      formatted: {
        planned_date: formatDate(m.planned_date),
        completed_date: formatDate(m.completed_date),
        status_label: formatMilestoneStatus(m.status),
      },
    };
  });
  const allInPeriod = milestoneEntries.filter((m) => m.in_period);
  const plannedInPeriod = milestoneEntries.filter((m) => isWithinPeriod(m.planned_date, period_start, period_end));
  const completedInPeriod = milestoneEntries.filter(
    (m) => m.completed_date && isWithinPeriod(m.completed_date, period_start, period_end),
  );

  const budgetLines = await sources.budget.listBudgetLines(grant_id);
  const allocations = await sources.budget.listAllocationsForPeriod(grant_id, period_start, period_end);
  const transactions = await sources.budget.listTransactionsForPeriod(grant_id, period_start, period_end);

  const budgetLineEntries: BudgetLineReportEntry[] = budgetLines.map((line) => {
    const allocated_this_period = allocations
      .filter((a) => a.budget_line_id === line.id)
      .reduce((sum, a) => sum + a.allocated_amount, 0);
    const spent_this_period = transactions
      .filter((t) => t.budget_line_id === line.id)
      .reduce((sum, t) => sum + t.amount, 0);
    const variance_pct = computeVariancePct(allocated_this_period, spent_this_period);
    return {
      id: line.id,
      category: line.category,
      allocated_this_period,
      spent_this_period,
      variance_pct,
      formatted: {
        allocated: formatCurrency(allocated_this_period, grant.currency),
        spent: formatCurrency(spent_this_period, grant.currency),
        variance_pct: formatPercent(variance_pct),
        summary: formatBudgetSummary(allocated_this_period, spent_this_period, variance_pct, grant.currency),
      },
    };
  });

  const totalAllocated = budgetLineEntries.reduce((sum, l) => sum + l.allocated_this_period, 0);
  const totalSpent = budgetLineEntries.reduce((sum, l) => sum + l.spent_this_period, 0);
  const totalVariancePct = computeVariancePct(totalAllocated, totalSpent);

  const evidence = sources.evidence
    ? await sources.evidence.listEvidenceForPeriod(grant_id, period_start, period_end)
    : null;
  const risks = sources.risks
    ? await sources.risks.listOpenRisksForPeriod(grant_id, period_start, period_end)
    : null;

  return {
    grant_id,
    period_start,
    period_end,
    prepared_date,
    grant,
    milestones: {
      planned_in_period: plannedInPeriod,
      completed_in_period: completedInPeriod,
      all_in_period: allInPeriod,
    },
    budget: {
      lines: budgetLineEntries,
      totals: {
        allocated_this_period: totalAllocated,
        spent_this_period: totalSpent,
        variance_pct: totalVariancePct,
        formatted: {
          allocated: formatCurrency(totalAllocated, grant.currency),
          spent: formatCurrency(totalSpent, grant.currency),
          variance_pct: formatPercent(totalVariancePct),
          summary: formatBudgetSummary(totalAllocated, totalSpent, totalVariancePct, grant.currency),
        },
      },
    },
    evidence,
    risks,
  };
}
