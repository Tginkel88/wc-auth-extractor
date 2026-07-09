# WC Authorization Extractor

A single internal Google Apps Script tool that watches a Gmail label for incoming
work-comp authorization faxes, extracts the key fields via Vertex AI Gemini (OCR +
structured extraction, all inside Google's HIPAA-BAA-covered services), and emails a
verify-against-source summary to the front desk, with a Google Sheet audit log.

See [docs/PRD.md](docs/PRD.md) for the full product spec.

> PHI handling: all processing stays within Workspace/Vertex AI under a signed BAA.
> The consumer Gemini API is never used. Not for distribution or sale.

## Agent skills

This repo has [Matt Pocock's agent skills](https://github.com/mattpocock/skills) installed
under [`.cursor/skills/`](.cursor/skills/) so Cursor (IDE and Cloud Agents) can invoke them
as `/skill-name` commands — e.g. `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`,
`/tdd`, `/triage`. Run `/setup-matt-pocock-skills` once before using the others; see
[`.cursor/skills/README.md`](.cursor/skills/README.md) for the full list and setup notes.
