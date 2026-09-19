import type {
  BudgetAllocationSchedule,
  BudgetLineItem,
  BudgetTransaction,
  EvidenceItem,
  GrantMetadata,
  MilestoneRecord,
  RiskFlag,
} from "./types.js";

// ---------------------------------------------------------------------------
// Repository interfaces — the only thing the assembly layer is allowed to
// talk to. Swap in real DB-backed implementations without touching assemble.ts.
// ---------------------------------------------------------------------------

export interface GrantRepository {
  getGrant(grantId: string): Promise<GrantMetadata>;
}

export interface MilestoneRepository {
  listMilestonesForGrant(grantId: string): Promise<MilestoneRecord[]>;
}

export interface BudgetRepository {
  listBudgetLines(grantId: string): Promise<BudgetLineItem[]>;
  listAllocationsForPeriod(
    grantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<BudgetAllocationSchedule[]>;
  listTransactionsForPeriod(
    grantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<BudgetTransaction[]>;
}

/** Not required until the /evidence module exists. */
export interface EvidenceRepository {
  listEvidenceForPeriod(grantId: string, periodStart: string, periodEnd: string): Promise<EvidenceItem[]>;
}

/** Not required until the risk dashboard exists. */
export interface RiskRepository {
  listOpenRisksForPeriod(grantId: string, periodStart: string, periodEnd: string): Promise<RiskFlag[]>;
}

export interface ReportDataSources {
  grants: GrantRepository;
  milestones: MilestoneRepository;
  budget: BudgetRepository;
  evidence?: EvidenceRepository;
  risks?: RiskRepository;
}

// ---------------------------------------------------------------------------
// In-memory implementations — useful for tests and for local development
// before the real grants/budget/evidence/risk modules are wired up.
// ---------------------------------------------------------------------------

export class InMemoryGrantRepository implements GrantRepository {
  constructor(private readonly grants: Map<string, GrantMetadata>) {}

  async getGrant(grantId: string): Promise<GrantMetadata> {
    const grant = this.grants.get(grantId);
    if (!grant) throw new Error(`Unknown grant: ${grantId}`);
    return grant;
  }
}

export class InMemoryMilestoneRepository implements MilestoneRepository {
  constructor(private readonly milestones: MilestoneRecord[]) {}

  async listMilestonesForGrant(grantId: string): Promise<MilestoneRecord[]> {
    return this.milestones.filter((m) => m.grant_id === grantId);
  }
}

export class InMemoryBudgetRepository implements BudgetRepository {
  constructor(
    private readonly lines: BudgetLineItem[],
    private readonly allocations: BudgetAllocationSchedule[],
    private readonly transactions: BudgetTransaction[],
  ) {}

  async listBudgetLines(grantId: string): Promise<BudgetLineItem[]> {
    return this.lines.filter((l) => l.grant_id === grantId);
  }

  async listAllocationsForPeriod(
    grantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<BudgetAllocationSchedule[]> {
    const lineIds = new Set(this.lines.filter((l) => l.grant_id === grantId).map((l) => l.id));
    return this.allocations.filter(
      (a) => lineIds.has(a.budget_line_id) && a.period_start === periodStart && a.period_end === periodEnd,
    );
  }

  async listTransactionsForPeriod(
    grantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<BudgetTransaction[]> {
    const lineIds = new Set(this.lines.filter((l) => l.grant_id === grantId).map((l) => l.id));
    return this.transactions.filter(
      (t) => lineIds.has(t.budget_line_id) && t.date >= periodStart && t.date <= periodEnd,
    );
  }
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  constructor(private readonly items: EvidenceItem[]) {}

  async listEvidenceForPeriod(grantId: string, periodStart: string, periodEnd: string): Promise<EvidenceItem[]> {
    return this.items.filter(
      (e) => e.grant_id === grantId && e.logged_date >= periodStart && e.logged_date <= periodEnd,
    );
  }
}

export class InMemoryRiskRepository implements RiskRepository {
  constructor(private readonly items: RiskFlag[]) {}

  async listOpenRisksForPeriod(grantId: string, _periodStart: string, _periodEnd: string): Promise<RiskFlag[]> {
    return this.items.filter((r) => r.grant_id === grantId && r.status === "open");
  }
}
