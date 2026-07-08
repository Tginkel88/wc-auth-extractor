# WC Authorization Extractor

A single internal Google Apps Script tool that watches Gmail for incoming
work-comp authorizations, MVA referrals, third-party/imaging referrals, and
records/subpoena requests; extracts key fields via Vertex AI Gemini (OCR +
structured extraction, all inside Google's HIPAA-BAA-covered services);
cross-references the referring provider against the practice's existing
work-comp provider spreadsheet to surface any NPI number already on file; and
emails a verify-against-source summary to the front desk, with a Google Sheet
audit log.

- **v1 PRD:** [docs/PRD.md](docs/PRD.md) — original WC-auth-only scope. **Already implemented and deployed** as a live Apps Script project.
- **v2 PRD (current target):** [docs/PRD-v2.md](docs/PRD-v2.md) — NPI lookup, date of injury, multi-category intake, auth-number aliases, pre-authorization, records/subpoena. This is an **incremental update to the existing deployment**; see "Existing deployment & incremental-update strategy" in the v2 PRD for a config-vs-code breakdown before implementing.

This repo currently holds documentation only — the live Apps Script source lives in the deployed project, not here.

> PHI handling: all processing stays within Workspace/Vertex AI under a signed BAA.
> The consumer Gemini API is never used. Not for distribution or sale.
