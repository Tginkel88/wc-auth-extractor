# WC Authorization Extractor

A single internal Google Apps Script tool that watches Gmail for incoming
work-comp authorizations, MVA referrals, third-party/imaging referrals, and
records/subpoena requests; extracts key fields via Vertex AI Gemini (OCR +
structured extraction, all inside Google's HIPAA-BAA-covered services);
cross-references the referring provider against the practice's existing
work-comp provider spreadsheet to surface any NPI number already on file; and
emails a verify-against-source summary to the front desk, with a Google Sheet
audit log.

- **v1 PRD:** [docs/PRD.md](docs/PRD.md) — original WC-auth-only scope
- **v2 PRD (current target):** [docs/PRD-v2.md](docs/PRD-v2.md) — NPI lookup, date of injury, multi-category intake, auth-number aliases, pre-authorization, records/subpoena

> PHI handling: all processing stays within Workspace/Vertex AI under a signed BAA.
> The consumer Gemini API is never used. Not for distribution or sale.
