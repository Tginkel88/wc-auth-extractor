# WC Authorization Extractor

Gravity Rail fax intake agent for work-comp authorizations, MVA referrals,
third-party/imaging referrals, records/subpoena requests, and blank faxes.

When a fax arrives on the fax channel, the agent OCRs the PDF, classifies the
document, extracts structured metadata, creates a **Fax Summaries** record, and
appends one row to the intake Google Sheet.

## Repository contents

| File | Purpose |
|------|---------|
| [prompt.md](prompt.md) | Gravity Rail orchestrator / combined extract prompt — classification rules, extraction schema, summary format, Jane starred-note block, and Google Sheets log columns |
| [prompts/new-patient-wc.md](prompts/new-patient-wc.md) | Gravity Rail worker prompt for new-patient workers' comp authorizations (`type` stays `workers_comp`; runs when `route = work_comp_new`) |

There is no Apps Script or clasp tooling in this repo. Intake runs entirely
through Gravity Rail.

## Prompt overview

The agent handles these document types:

- `blank`
- `workers_comp`
- `mva`
- `third_party_referral`
- `imaging_referral`
- `records_or_subpoena`
- `unknown`

For each fax it produces a structured staff-facing summary (with optional Jane
paste block for clinical auth types) and logs the result to the configured
spreadsheet.

> PHI handling: process faxes only through approved Gravity Rail integrations
> and connected Google Workspace accounts under your signed BAA. Not for
> distribution or sale.
