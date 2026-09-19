# grant-report-tool

Data model and assembly plumbing for donor grant reports. Implements the
first three steps of the suggested build order — data assembly, template
rendering, and the AI-narrative boundary — as a dependency-light TypeScript
library with no UI or provider lock-in.

## The hard rule

**Every dollar figure, date, and percentage in a report is pulled directly
from the data object and inserted into the template.** The AI only writes
the connecting narrative around those numbers. This is enforced structurally,
not just by convention:

- `assemble.ts` computes every number (allocations, spend, variance %) from
  the data sources and immediately formats it into a string via `format.ts`.
- `narrative.ts`'s `NarrativePromptContext.facts` is typed as
  `Record<string, string>` — there is no field a context builder could use to
  hand the model a raw `number`. Every section's context builder pulls only
  `.formatted` strings (or plain labels) out of `AssembledReportData`.
- `buildPrompt()` prepends an explicit instruction that every figure in the
  narrative must be copied verbatim from the supplied facts.

A formatting bug in `format.ts` is the only way a wrong figure could reach a
report or a prompt — never a model computation error.

## Modules

| Module | Responsibility |
| --- | --- |
| `types.ts` | `ReportRecord`, `GrantMetadata`, milestone/budget/evidence/risk types, `AssembledReportData` |
| `format.ts` | Currency/date/percent formatting; the only place numbers become strings |
| `dataSources.ts` | Repository interfaces (`GrantRepository`, `BudgetRepository`, ...) + in-memory implementations for tests/local dev |
| `assemble.ts` | `assembleReportData()` — pure plumbing, no AI, lowest risk |
| `template.ts` | Report Template v1 section order, auto-section rendering, `DraftReport` shape |
| `narrative.ts` | Per-section prompt context builders + `regenerateSection()` |
| `review.ts` | Status state machine (`draft → in_review → finalized → sent`) + human-edit tracking |
| `export.ts` | Export guard (`finalized`/`sent` only) + dependency-free HTML renderer as a PDF/docx precursor |

## Report Template v1

1. **Header** — auto, no AI
2. **Progress summary** — AI-drafted narrative over milestone status
3. **Milestone table** — auto, planned vs. actual
4. **Budget narrative** — AI-drafted, explains variances
5. **Budget table** — auto, numbers pulled directly from budget lines
6. **Risks and mitigations** — AI-drafted from logged risk data only; section is marked `applicable: false` and omitted from export until a risk data source is wired up
7. **Next period outlook** — AI-drafted, short, forward-looking

## Usage sketch

```ts
import {
  assembleReportData,
  renderTemplate,
  regenerateSection,
  submitForReview,
  finalizeReport,
  exportReport,
} from "grant-report-tool";

const data = await assembleReportData(sources, {
  grant_id: "g1",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
});

let draft = renderTemplate(reportRecord, data);
draft = { ...draft, report: submitForReview(draft.report) };

// regenerate one section without touching the rest of the report
draft = await regenerateSection(draft, "progress_summary", myLlmGenerator);

draft = finalizeReport(draft); // throws if any applicable AI section is still empty
const bytes = await exportReport(draft, myPdfExporter); // throws unless finalized/sent
```

## What's not here yet (fast-follows, per the suggested build order)

- Review/edit UI (step 4) — this package only exposes the data + transition
  functions a UI would call.
- Real PDF/docx exporters (step 5) — `export.ts` defines the `ReportExporter`
  contract and an HTML precursor; a concrete renderer (headless-browser PDF,
  docx templating) plugs in without touching the rest of the module.
- Evidence and risk repositories back real data once `/evidence` and the risk
  dashboard exist — `dataSources.ts` already defines their interfaces and
  `assemble.ts`/`template.ts` already handle their absence gracefully.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest
```
