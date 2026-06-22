# PRD: Work-Comp Authorization Extractor

**Status:** Ready for agent
**Platform:** Google Apps Script (JavaScript), container-bound to the audit-log Google Sheet
**Owner:** Front-desk / WC intake (personal internal tool)

---

## Problem Statement

When work-comp authorizations arrive at the practice (as scanned/faxed images emailed into a Google Workspace inbox), the front desk has to open each fax, read it, and manually transcribe a dozen fields — patient DOB, claim number, authorization number, approved visit count, date range, diagnosis/procedure codes, body regions, and more — into the practice's systems to set up insurance policies and patient information.

This is slow, error-prone, and repetitive. The documents come from many different work-comp carriers in inconsistent layouts, and they're scans/faxes (image quality varies), so there's no clean structured data to copy from. Misreading a claim number or visit count creates real downstream billing/eligibility problems, and a missed auth slips through silently.

## Solution

An automated Apps Script that watches a dedicated Gmail label for incoming work-comp authorizations, extracts the needed fields using Google's Vertex AI Gemini (OCR + structured extraction in one call, all within the practice's HIPAA-covered Google services), and emails a clean, per-authorization summary to the front-desk team.

Critically, the output is treated as an **assist, not an authority**: every email includes a link to the original document in Drive so the front desk verifies each field against the source before keying it in, and every field carries a confidence flag so low-confidence values are visually flagged. Nothing is ever silently dropped — if the system can't read a required field, the email still goes out marked "needs manual review." Every processed auth is recorded in a Google Sheet audit log.

## User Stories

1. As the WC coordinator, I want incoming authorization faxes to be detected automatically, so that I don't have to watch the inbox manually.
2. As the WC coordinator, I want each authorization summarized in its own email, so that each one is a self-contained, actionable to-do.
3. As the WC coordinator, I want the patient's name in the email subject, so that I can identify whose policy I'm setting up at a glance.
4. As the WC coordinator, I want the patient's date of birth extracted, so that I can match and enter the patient record correctly.
5. As the WC coordinator, I want the referring provider extracted, so that I can record who referred the patient.
6. As the WC coordinator, I want the insurer / claims administrator extracted, so that I can attach the correct payer.
7. As the WC coordinator, I want the claim number extracted, so that I have the primary work-comp identifier.
8. As the WC coordinator, I want a member/subscriber number extracted when present, so that managed-care-network cases are handled correctly.
9. As the WC coordinator, I want the employer name extracted, so that I have the work-comp employer for identification and billing.
10. As the WC coordinator, I want the WCAB/case number extracted when present, so that state-board references are captured.
11. As the WC coordinator, I want the authorization number extracted, so that I can reference the specific auth.
12. As the WC coordinator, I want the authorization date range extracted, so that I know the valid window for visits.
13. As the WC coordinator, I want the number of approved visits extracted, so that I can track the visit allotment.
14. As the WC coordinator, I want the authorized CPT procedure codes (including modalities) extracted, so that I know what services are covered.
15. As the WC coordinator, I want the ICD-10 diagnosis codes extracted, so that I can record the injury/diagnosis.
16. As the WC coordinator, I want the authorized body regions extracted, so that I know the anatomical scope of the auth.
17. As the WC coordinator, I want a one-click link to the original authorization in Drive in every email, so that I can verify each field against the source before entering it.
18. As the WC coordinator, I want low-confidence or unreadable fields visually flagged, so that I know exactly where to look hardest.
19. As the WC coordinator, I want authorizations that couldn't be fully read to still be emailed and marked "needs manual review," so that nothing slips through unseen.
20. As the WC coordinator, I want already-processed faxes to never be emailed twice, so that I'm not confused by duplicates from the same message.
21. As the manager, I want to be CC'd on each authorization email, so that I have oversight of incoming work-comp volume.
22. As the manager, I want the option to switch to a daily digest later, so that I can reduce inbox noise if per-auth volume becomes overwhelming.
23. As the biller, I want to be CC'd on each authorization, so that I have the auth number and visit count early for billing setup.
24. As any recipient, I want all PHI to stay inside the practice's HIPAA-covered Google services, so that we remain compliant.
25. As the WC coordinator, I want a searchable Google Sheet log of every processed auth, so that I can look up history and have an audit trail.
26. As a compliance reviewer, I want an audit trail of what was processed, when, and to whom it was sent, so that PHI handling is accountable.
27. As the tool owner, I want a shadow-mode rollout where emails initially go only to me, so that I can tune extraction accuracy on real faxes before exposing the front desk to mistakes.
28. As the tool owner, I want to set up a Gmail filter that routes WC auths to a dedicated label, so that the script only processes relevant mail and wastes no AI calls.
29. As the tool owner, I want the script to run on a recurring trigger, so that auths are processed near-real-time without manual runs.
30. As the tool owner, I want the system authenticated via my own Workspace login (no service-account key files), so that there are no secrets to store or leak.
31. As the WC coordinator, I want multi-page faxes read in full, so that fields spread across pages are still captured.

## Implementation Decisions

**Platform & compliance**
- Built in **Google Apps Script (JavaScript)**, container-bound to the audit-log Google Sheet. The original "Python" framing is dropped — Apps Script lives inside Workspace, reads Gmail and sends mail natively, and needs no servers.
- All processing stays within **HIPAA-BAA-covered Google services**: Gmail, Drive, Vertex AI, Sheets. The **consumer Gemini API is explicitly NOT used.**
- Vertex AI is called from Apps Script via `UrlFetchApp` authenticated with `ScriptApp.getOAuthToken()` — **no service-account key files**. Requires a linked GCP project with the Vertex AI API enabled and the `cloud-platform` OAuth scope added (one-time admin setup).

**Intake & triggering**
- A **time-driven trigger runs every ~10 minutes.**
- It scans only the Gmail label **`WC-Auths`** (populated by a user-configured Gmail filter keyed on e-fax sender/subject; tuned on real mail).
- **Idempotency** via label swap: after processing, `WC-Auths` → `WC-Processed`. The same email is never reprocessed. Re-faxed duplicates are rare and handled by humans (no automated dedup in v1).
- Document model: **1 fax = 1 authorization**, possibly multi-page. Gemini reads all pages in one call.

**Extraction**
- For each message, the PDF is saved to a **Drive folder accessible to the three recipients**, then sent to **Vertex AI Gemini** for combined OCR + structured field extraction, returning JSON with **per-field confidence flags**.
- **Field set:** patient name, DOB, referring provider, insurer/claims administrator, claim # (primary identifier), member/subscriber # (when present), employer, WCAB/case #, authorization #, authorization date range, number of approved visits, CPT procedure codes (modalities included), ICD-10 diagnosis codes, body regions.
  - Note: the original request said "member/subscriber number" — corrected to reflect that work-comp auths use a **claim number** as the primary identifier; member/subscriber is captured only when genuinely present.
  - Note: "modality codes" are a subset of CPT and are folded into the CPT field, not tracked separately.

**Output**
- **One email per authorization.** Subject includes patient name + auth #.
- Body lists all fields with low-confidence/missing fields flagged, plus a **▶ link to the original document in Drive**.
- Output is framed as an **assist, not authority** — the front desk verifies against the source before data entry.
- **Recipients:** WC coordinator (To), Manager (CC), Biller (CC) — all confirmed cleared for PHI. Manager may be moved to a daily digest later without disturbing the rest.
- **Failure handling:** never drop an auth. Missing/low-confidence required fields → email still sends, clearly marked **⚠️ NEEDS MANUAL REVIEW**.

**Audit log**
- One row appended per processed auth to the bound Google Sheet: timestamp, patient, claim #, auth #, visits, recipients, review-needed flag. Serves as audit trail, history search, and a future dedup foundation.

**Module breakdown (deep modules)**
- **AuthExtractor** — `extract(pdfBlob) → AuthRecord`. Encapsulates the Vertex AI call, prompt, and response handling behind a simple interface.
- **ResponseParser** — `parse(rawJson) → AuthRecord`. Pure validation/normalization of Gemini's JSON into a typed record.
- **ReviewPolicy** — `evaluate(authRecord) → {reviewNeeded, flaggedFields}`. Pure decision logic for the manual-review banner and field flags.
- **EmailComposer** — `compose(authRecord, sourceUrl) → {subject, html}`. Pure rendering of the per-auth email.
- **IntakeReader** — `fetchPending()`, `markProcessed()`. Thin GmailApp wrapper for label scanning and label swap.
- **DriveArchiver** — `archive(blob) → url`. Thin DriveApp wrapper saving to the shared folder.
- **AuditLogger** — `log(authRecord, recipients, reviewNeeded)`. Thin SpreadsheetApp wrapper.
- **Orchestrator** — `run()`. Thin glue invoked by the 10-minute trigger.

**Rollout**
- **Shadow mode** for ~1–2 weeks: all emails go **only to the tool owner** on real auths, to tune the Gemini prompt against source documents. Real recipients (coordinator, manager, biller) are added once accuracy is proven.

## Testing Decisions

- **What makes a good test here:** tests assert **external behavior**, not implementation details. They feed a module a representative input and assert on its output — e.g. given a sample Gemini JSON response, the parser yields the expected `AuthRecord`; given a record with a missing claim #, `ReviewPolicy` returns `reviewNeeded: true` with the right flagged field; given a record, `EmailComposer` produces a subject/body containing the expected values and the ⚠️ banner when appropriate. Tests do not assert on private helpers or internal call sequences.
- **Modules to be tested (the pure-logic core, where correctness risk lives):**
  - **ResponseParser** — parsing/normalizing/validating Gemini JSON, including malformed and partial responses.
  - **ReviewPolicy** — review-needed decisions and low-confidence/missing-field flagging across complete, partial, and empty records.
  - **EmailComposer** — subject/body rendering, source-link inclusion, and the manual-review banner toggling on confidence/missingness.
  - **AuthExtractor (parsing logic)** — its response-handling path, exercised with mocked Vertex AI JSON (the network call itself is not unit-tested).
- **Not tested in v1:** the thin Google-API wrappers (IntakeReader/GmailApp, DriveArchiver/DriveApp, AuditLogger/SpreadsheetApp) — they're shallow pass-throughs that are hard to unit-test in Apps Script and low-value to mock. They are validated in shadow mode instead.
- **Prior art:** none yet (greenfield project). Tests can run via `clasp` + a lightweight Apps Script test harness, or as plain pure-function tests of the four logic modules extracted so they don't depend on the Google runtime.

## Out of Scope

- Writing extracted data directly into the practice management / insurance system (the tool emails an assist; humans key it in).
- Automated deduplication of re-faxed/corrected authorizations (handled manually in v1; the audit log lays groundwork for adding it later).
- Splitting multiple authorizations out of a single fax (current model: 1 fax = 1 auth).
- A Sheet-as-primary-interface workflow (email is the primary interface; the Sheet is an audit log).
- Non-work-comp referrals/authorizations (commercial insurance, etc.).
- Any use of non-Google or non-BAA-covered AI/OCR services.
- Selling, distributing, or documenting this as a product — it is a single internal tool.

## Further Notes

- **Three external truth-checks remain the owner's responsibility (not build blockers):**
  1. The BAA/PHI clearance is genuinely in place for this Workspace and these recipients (compliance's call).
  2. The Gmail filter has a reliable criterion to catch WC auths — to be confirmed against real e-fax headers.
  3. The Workspace admin can perform the GCP project link + Vertex AI enablement + OAuth scope addition.
- **Publishing note:** this PRD was saved to a file because no project issue tracker / git repo exists in the working environment. When a GitHub repo is created for this tool, the PRD can be filed as an issue with the `ready-for-agent` label.
