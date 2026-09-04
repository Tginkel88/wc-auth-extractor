# WC Authorization Extractor

Gravity Rail fax intake agent for work-comp authorizations, MVA referrals,
third-party/imaging referrals, records/subpoena requests, and blank faxes.

When a fax arrives on the fax channel, the agent OCRs the PDF, classifies the
document, extracts structured metadata, creates a **Fax Summaries** record, and
appends one row to the intake Google Sheet.

## Repository contents

| File | Purpose |
|------|---------|
| [prompt.md](prompt.md) | Gravity Rail agent prompt — classification rules, extraction schema, summary format, Jane starred-note block, and Google Sheets log columns |
| [docs/document-processing-workflow-audit.md](docs/document-processing-workflow-audit.md) | Audit of the live fax/email document pipeline and recommended workflow changes |
| [scripts/pull-live-workflow.sh](scripts/pull-live-workflow.sh) | Read-only `gr` dump of the Radius PT workflow graph (no PHI records) |

There is no Apps Script or clasp tooling in this repo. Intake runs entirely
through Gravity Rail.

## Workflow audit

A full review of the fax/email document pipeline (OCR, classification,
`fax_summaries`, Google Sheets, staff email, Jane paste) is in
[docs/document-processing-workflow-audit.md](docs/document-processing-workflow-audit.md).

To dump the live Gravity Rail graph (no PHI records): install
`@gravity-rail/cli`, run `gr login --env prod`, then
[`scripts/pull-live-workflow.sh`](scripts/pull-live-workflow.sh).

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
