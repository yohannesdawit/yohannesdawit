// Formatting helpers shared by the assembly layer, table renderers, and the
// narrative-prompt builders. Everything here produces STRINGS. The AI layer
// (see narrative.ts) is only ever allowed to consume the strings produced
// here — never the raw numbers — so a formatting bug is the only way a wrong
// figure could reach a prompt, not a model computation error.

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

export function formatMilestoneStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** (spent - allocated) / allocated * 100. Null when allocated is 0 (undefined variance). */
export function computeVariancePct(allocated: number, spent: number): number | null {
  if (allocated === 0) return null;
  return ((spent - allocated) / allocated) * 100;
}

/** e.g. "spent $12,400 of $15,000 allocated (+3.2% variance)" */
export function formatBudgetSummary(
  allocated: number,
  spent: number,
  variancePct: number | null,
  currency: string,
): string {
  const allocatedStr = formatCurrency(allocated, currency);
  const spentStr = formatCurrency(spent, currency);
  const varianceStr =
    variancePct === null ? "no allocation to compare against" : `${formatPercent(variancePct)} variance`;
  return `spent ${spentStr} of ${allocatedStr} allocated (${varianceStr})`;
}

/** Returns true if `date` falls within [periodStart, periodEnd], inclusive, all ISO YYYY-MM-DD. */
export function isWithinPeriod(date: string, periodStart: string, periodEnd: string): boolean {
  return date >= periodStart && date <= periodEnd;
}
