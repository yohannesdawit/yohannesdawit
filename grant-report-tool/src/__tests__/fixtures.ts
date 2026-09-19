import {
  InMemoryBudgetRepository,
  InMemoryGrantRepository,
  InMemoryMilestoneRepository,
  type ReportDataSources,
} from "../dataSources.js";
import type {
  BudgetAllocationSchedule,
  BudgetLineItem,
  BudgetTransaction,
  GrantMetadata,
  MilestoneRecord,
} from "../types.js";

export const GRANT_ID = "g1";
export const PERIOD_START = "2026-01-01";
export const PERIOD_END = "2026-03-31";

const grant: GrantMetadata = {
  grant_id: GRANT_ID,
  name: "Clean Water Initiative",
  donor: "Acme Foundation",
  currency: "USD",
  grant_start: "2026-01-01",
  grant_end: "2026-12-31",
};

const milestones: MilestoneRecord[] = [
  {
    id: "m1",
    grant_id: GRANT_ID,
    title: "Site assessment complete",
    planned_date: "2026-01-15",
    completed_date: "2026-01-20",
    status: "completed",
  },
  {
    id: "m2",
    grant_id: GRANT_ID,
    title: "Well drilling started",
    planned_date: "2026-03-01",
    completed_date: null,
    status: "in_progress",
  },
  {
    id: "m3",
    grant_id: GRANT_ID,
    title: "Community training",
    planned_date: "2026-06-01",
    completed_date: null,
    status: "not_started",
  },
];

const budgetLines: BudgetLineItem[] = [
  { id: "l1", grant_id: GRANT_ID, category: "Drilling equipment", allocated_total: 50000 },
  { id: "l2", grant_id: GRANT_ID, category: "Community training", allocated_total: 20000 },
];

const allocations: BudgetAllocationSchedule[] = [
  { budget_line_id: "l1", period_start: PERIOD_START, period_end: PERIOD_END, allocated_amount: 15000 },
  { budget_line_id: "l2", period_start: PERIOD_START, period_end: PERIOD_END, allocated_amount: 5000 },
];

const transactions: BudgetTransaction[] = [
  { id: "t1", budget_line_id: "l1", amount: 8000, date: "2026-02-01" },
  { id: "t2", budget_line_id: "l1", amount: 4400, date: "2026-03-10" },
  { id: "t3", budget_line_id: "l2", amount: 5200, date: "2026-02-15" },
];

export function buildTestSources(): ReportDataSources {
  return {
    grants: new InMemoryGrantRepository(new Map([[GRANT_ID, grant]])),
    milestones: new InMemoryMilestoneRepository(milestones),
    budget: new InMemoryBudgetRepository(budgetLines, allocations, transactions),
  };
}

export const EXPECTED = {
  l1AllocatedThisPeriod: 15000,
  l1SpentThisPeriod: 12400,
  l2AllocatedThisPeriod: 5000,
  l2SpentThisPeriod: 5200,
  totalAllocated: 20000,
  totalSpent: 17600,
};
