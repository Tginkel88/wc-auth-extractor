# WC Authorization Extractor

A single internal Google Apps Script tool that watches a Gmail label for incoming
work-comp authorization faxes, extracts the key fields via Vertex AI Gemini (OCR +
structured extraction, all inside Google's HIPAA-BAA-covered services), and emails a
verify-against-source summary to the front desk, with a Google Sheet audit log.

See [docs/PRD.md](docs/PRD.md) for the full product spec.

> PHI handling: all processing stays within Workspace/Vertex AI under a signed BAA.
> The consumer Gemini API is never used. Not for distribution or sale.
