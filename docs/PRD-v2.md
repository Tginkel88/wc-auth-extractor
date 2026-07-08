# PRD v2: Intake Document Classifier & Work-Comp Tracker

**Status:** Ready for agent  
**Platform:** Google Apps Script (JavaScript), container-bound to the audit-log Google Sheet  
**Owner:** Front-desk / WC intake (personal internal tool)  
**Supersedes / extends:** [PRD v1](./PRD.md) (Work-Comp Authorization Extractor)

---

## Problem Statement

v1 solved the core pain of manually reading work-comp authorization faxes and emailing a verify-against-source field summary. In practice, the same inbox also receives **motor vehicle accident (MVA)** packets, **third-party / imaging referrals**, and **records / subpoena requests** — often from inconsistent e-fax senders and subject lines. Staff still have to open each message, figure out what kind of document it is, and route it mentally.

Separately, when setting up a work-comp case, the front desk must look up the referring provider in the company's **MPI work-comp spreadsheet** to find whether an **MPI number** already exists. That lookup is easy to miss and slows intake.

Extraction gaps in v1 also force extra reading of the source fax:

- **Date of injury** is often on the form but was not extracted.
- The primary authorization identifier is inconsistently labeled across carriers as **authorization number**, **review number**, or **referral ID** — v1 only looked for "authorization number."
- Some packets are **pre-authorizations** (or require a pre-auth step) and need to be called out distinctly from a fully approved auth.

## Solution

Extend the Apps Script tool into a **multi-category intake classifier + extractor** that:

1. **Classifies** each incoming labeled email/attachment into one of:
   - Work-comp authorization (including pre-authorization when applicable)
   - Motor vehicle accident
   - Third-party referral / imaging referral
   - Records request / subpoena request
   - Unknown / needs manual triage (low confidence)
2. **Extracts** category-appropriate fields via Vertex AI Gemini (OCR + structured extraction), still inside HIPAA-BAA-covered Google services.
3. **Cross-references** the referring provider name against the company's **MPI work-comp spreadsheet** and surfaces any matching **MPI number** in the email (so staff do not dig for it).
4. **Emails** a per-document summary with category in the subject, confidence flags, a Drive link to the source, and never silently drops a document.

Output remains an **assist, not an authority**: humans verify against the source before keying data into practice systems.

## Goals (v2)

- Reduce time spent identifying *what kind of document* arrived.
- Surface MPI numbers via spreadsheet lookup when the referring provider matches.
- Capture date of injury and all common aliases for the authorization identifier.
- Call out pre-authorization when present or required.
- Keep PHI inside Workspace + Vertex AI; no consumer Gemini API; no service-account key files.

## Non-Goals (v2)

Same as v1, plus:

- Automatically writing into the practice management system.
- Fully automated legal response to subpoenas (classification + summary only; humans handle fulfillment).
- Replacing the MPI spreadsheet as a system of record (read/lookup only in v2).
- Perfect classification from subject/header alone — attachment content is the primary signal when headers are unreliable.

---

## User Stories

### Carried forward from v1 (still required)

1–31 from [PRD v1](./PRD.md) remain in scope for work-comp authorizations (auto-detect, per-doc email, patient name in subject, DOB, referring provider, insurer, claim #, member/subscriber when present, employer, WCAB/case #, auth identifiers, date range, visits, CPT, ICD-10, body regions, Drive link, confidence flags, never drop, no duplicate emails for the same message, CC manager/biller, PHI in Google services, Sheet audit log, shadow mode, Gmail filter, recurring trigger, Workspace OAuth, multi-page faxes).

### New / changed in v2

32. As the WC coordinator, I want incoming mail classified into WC auth, MVA, third-party/imaging referral, or records/subpoena, so that I know how to act without opening every fax first.
33. As the WC coordinator, I want classification to use the email body **and** attachment content (not only subject/from), so that inconsistent e-fax headers do not mis-route documents.
34. As the WC coordinator, I want each classification to include a **confidence score**, so that low-confidence items are marked for manual triage instead of being forced into the wrong bucket.
35. As the WC coordinator, I want the email subject and a clear banner to show the document category, so that I can sort/filter my inbox by type.
36. As the WC coordinator, I want the **date of injury** extracted when present, so that I can enter DOI without re-reading the fax.
37. As the WC coordinator, I want **authorization number**, **review number**, and **referral ID** all extracted when present, so that whichever label the carrier used is captured.
38. As the WC coordinator, I want a single "primary auth identifier" surfaced in the email (preferring whichever of auth # / review # / referral ID is present), so that I have one value to key first.
39. As the WC coordinator, I want a **pre-authorization** section when the document is a pre-auth or indicates pre-auth is required, so that I do not treat it as a fully approved visit allotment.
40. As the WC coordinator, I want the tool to look up the referring provider in the **MPI work-comp spreadsheet** and show any matching **MPI number**, so that I do not dig through the sheet manually.
41. As the WC coordinator, I want fuzzy / normalized provider-name matching (e.g. "Smith, John" vs "John Smith, MD"), so that minor name formatting differences still find the MPI row.
42. As the WC coordinator, I want ambiguous MPI matches (multiple possible rows) flagged for manual confirmation, so that the wrong MPI number is never presented as certain.
43. As the intake staff, I want MVA packets summarized with the fields that matter for MVA intake (patient, DOI if present, referring provider, insurer/adjuster when present, key IDs), so that MVA mail is actionable in the same workflow.
44. As the intake staff, I want third-party / imaging referrals summarized with patient, referring provider, requested study/service, and any referral/auth IDs, so that imaging referrals are not mixed into WC auth setup.
45. As the records staff, I want records requests and subpoena requests categorized and summarized (requestor, patient identifiers, due date if present, scope of records), so that legal/records demand is visible and not mistaken for an authorization.
46. As the manager, I want the audit log to record document category and classification confidence, so that volume and misclassification can be reviewed.
47. As the tool owner, I want category-specific Gmail labels after processing (or a category field in the email + audit log), so that processed mail remains findable by type.
48. As the tool owner, I want shadow-mode rollout for classification + MPI lookup before expanding recipients, so that false categories and wrong MPI matches are tuned on real mail first.

---

## Implementation Decisions

### Platform & compliance (unchanged from v1)

- **Google Apps Script (JavaScript)**, container-bound to the audit-log Google Sheet.
- All processing stays within **HIPAA-BAA-covered Google services**: Gmail, Drive, Vertex AI, Sheets. **Consumer Gemini API is NOT used.**
- Vertex AI via `UrlFetchApp` + `ScriptApp.getOAuthToken()` — **no service-account key files**.
- Linked GCP project with Vertex AI API enabled and `cloud-platform` OAuth scope (one-time admin setup).

### Intake & triggering

- Time-driven trigger every **~10 minutes**.
- Scan a dedicated intake label (v1: `WC-Auths`). **v2 recommendation:** broaden the filter/label to a shared intake label such as **`Intake-Pending`** (or keep `WC-Auths` as a legacy alias) so MVA, third-party/imaging, and records/subpoena mail can land in the same pipeline. Exact filter criteria remain an owner truth-check against real e-fax headers.
- **Idempotency** via label swap after processing: `Intake-Pending` → category-specific processed label, e.g.:
  - `Intake-Processed/WC-Auth`
  - `Intake-Processed/MVA`
  - `Intake-Processed/Third-Party-Referral`
  - `Intake-Processed/Records-Subpoena`
  - `Intake-Processed/Needs-Triage` (low-confidence / unknown)
- Document model remains **1 fax/PDF attachment set ≈ 1 document** for v2; multi-page PDFs read in one Gemini call. Splitting multiple unrelated docs in one fax stays out of scope.

### Classification (new)

- Add a **DocumentClassifier** step before (or combined with) extraction.
- **Signals (in priority order for the model):**
  1. Attachment page text / layout cues (form titles, "subpoena", "records request", "authorization", "MRI referral", accident language, etc.)
  2. Email subject and body
  3. From / sender domain (weak signal only — e-fax headers are inconsistent)
- **Output:** `{ category, confidence, rationale }` where `category` is one of:
  - `wc_authorization`
  - `wc_preauthorization` (or `wc_authorization` + `preAuth: true` — see Pre-authorization below)
  - `mva`
  - `third_party_referral` (includes imaging referrals)
  - `records_or_subpoena`
  - `unknown`
- **Confidence policy (initial defaults; tunable in shadow mode):**
  - `confidence >= 0.80` → treat as classified; proceed with category-specific extraction + email.
  - `0.50 <= confidence < 0.80` → email still sends with **⚠️ LOW CONFIDENCE CATEGORY — VERIFY TRIAGE**; use best-guess category for extraction template but banner for manual sort.
  - `confidence < 0.50` or `unknown` → email marked **⚠️ NEEDS MANUAL TRIAGE**; minimal/generic extraction; processed label `Needs-Triage`.
- Prefer a **single Gemini call** that returns both classification and extraction JSON when practical (lower latency/cost); keep classifier logic separable so thresholds can change without rewriting prompts.

### Extraction field set (v2)

**Shared / common fields (extract when present, all categories):**

| Field | Notes |
|-------|--------|
| Patient name | |
| DOB | |
| Date of injury (DOI) | **New in v2** — extract when present |
| Referring provider | Used for display + MPI lookup |
| Insurer / claims administrator / adjuster | Category-dependent labeling in email |
| Claim # | Primary WC identifier when present |
| Member/subscriber # | Only when genuinely present |
| Employer | Especially WC |
| WCAB / case # | When present |
| Authorization # | Carrier may label differently — see aliases |
| Review # | **New** — auth-number alias |
| Referral ID # | **New** — auth-number alias |
| Primary auth identifier | Derived: first non-empty among auth #, review #, referral ID (configurable preference order) |
| Authorization date range | |
| Approved visit count | |
| CPT / procedure codes | Modalities included |
| ICD-10 codes | |
| Body regions | |
| Pre-authorization | **New** — see below |
| Requestor / issuing party | Especially records/subpoena |
| Due date / response deadline | Especially records/subpoena |
| Scope of records requested | Especially records/subpoena |
| Requested study / service | Especially imaging / third-party referral |

**Authorization identifier aliases**

- Gemini must look for labels/synonyms including (non-exhaustive): authorization number, auth #, auth no., review number, review #, referral ID, referral number, referral #, tracking number (only when clearly the auth/referral identifier in context).
- Store **all three** discrete fields when present (`authorizationNumber`, `reviewNumber`, `referralId`) plus a derived `primaryAuthIdentifier` for subject line and audit log.
- Low confidence on all three → flag; do not invent a value.

**Pre-authorization section**

- Model returns `preAuthorization: { applicable: boolean, status: string|null, notes: string|null, confidence }`.
- `applicable: true` when the document is a pre-auth, pending pre-auth, or explicitly states pre-authorization is required before treatment.
- EmailComposer renders a dedicated **Pre-authorization** block when `applicable` is true (status/notes + flag if low confidence).
- If the whole document is a WC pre-auth, category may be `wc_preauthorization` **or** `wc_authorization` with `preAuthorization.applicable = true` — pick one representation in implementation and keep ReviewPolicy/EmailComposer consistent. Recommendation: category `wc_authorization` + `preAuthorization` object so WC field templates stay unified.

**Category-specific emphasis (email sections, not hard schema forks):**

- **WC auth / pre-auth:** full WC field set + MPI lookup + pre-auth block.
- **MVA:** patient, DOI, referring provider, insurer/adjuster, claim/policy IDs when present; WC-only fields omitted or shown as "n/a" if absent.
- **Third-party / imaging referral:** patient, referring provider, requested study/service, referral/auth IDs, ICD if present.
- **Records / subpoena:** requestor, patient identifiers, due date, scope; auth/visit fields usually n/a; strong banner that this is **not** an authorization.

### MPI work-comp spreadsheet integration (new)

- **MpiLookup** module: `lookupByProviderName(name) → { status, mpiNumber?, matchedName?, candidates?, confidence }`.
- Spreadsheet is the company's existing MPI work-comp Sheet (ID/tab/column mapping in Script Properties — not hard-coded secrets; sheet ID is configuration).
- **Read-only** in v2: never write back to the MPI sheet.
- Matching approach:
  1. Normalize extracted provider name (strip credentials MD/DO/PT, punctuation, extra whitespace; case-fold; optional last-name-first ↔ first-last reorder).
  2. Scan configured provider-name column(s); score candidates (exact normalized match > token overlap).
  3. **Single high-confidence match** → include MPI number in email as a confirmed lookup result (still verify-against-source framing for the fax fields; MPI is "from company spreadsheet").
  4. **Multiple plausible matches** → list top candidates in email under **⚠️ MPI MATCH AMBIGUOUS**; do not pick silently.
  5. **No match** → show **MPI: not found in spreadsheet** (not an error; coordinator may still proceed).
- MPI lookup runs for categories where a referring provider is relevant (at minimum WC auth/pre-auth; optionally MVA and third-party referral). Skip for pure records/subpoena unless a provider name was extracted and lookup is cheap.
- Cache sheet reads briefly within a single `run()` (read once per trigger execution) to avoid re-opening the Sheet for every message in the batch.

### Output / email

- **One email per document.**
- Subject pattern (v2): `[Category] Patient Name — PrimaryAuthId` (or DOI/requestor snippet when auth id absent). Examples:
  - `[WC Auth] Jane Doe — Auth 12345`
  - `[WC Pre-Auth] Jane Doe — Review 99881`
  - `[MVA] John Smith`
  - `[Imaging Referral] Jane Doe — Referral 55`
  - `[Records/Subpoena] Jane Doe — due 2026-08-01`
  - `[Needs Triage] …`
- Body includes:
  - Category + classification confidence
  - Assist-not-authority disclaimer + ▶ Drive link
  - Field list with low-confidence/missing flags
  - **MPI number** block (match / ambiguous / not found)
  - **Pre-authorization** block when applicable
  - Auth identifier subsection listing authorization #, review #, referral ID (and which was chosen as primary)
- Recipients unchanged unless owner configures otherwise: WC coordinator (To), Manager (CC), Biller (CC); records/subpoena may later route to a records mailbox via config — **configurable recipient map by category** in Script Properties.
- Failure handling unchanged: never drop; missing required fields or low classification confidence → still email with clear ⚠️ banner.

### Audit log (extended)

Append one row per processed document:

- Timestamp
- Category + classification confidence
- Patient
- DOI (when present)
- Claim #
- Primary auth identifier (+ raw auth # / review # / referral ID columns if useful)
- Visits (when applicable)
- Pre-auth flag
- MPI number (or match status)
- Recipients
- Review-needed / triage-needed flags
- Source Drive URL

### Module breakdown (v2)

Keep v1 deep modules; add/adjust:

| Module | Responsibility |
|--------|----------------|
| **DocumentClassifier** | `classify(emailMeta, pdfBlob) → {category, confidence, rationale}` (may be merged into AuthExtractor prompt I/O but kept as a logical module) |
| **AuthExtractor** → rename conceptually to **DocumentExtractor** | `extract(pdfBlob, categoryHint?) → DocumentRecord` — Vertex call, prompt, response handling |
| **ResponseParser** | `parse(rawJson) → DocumentRecord` — validate/normalize including new fields |
| **ReviewPolicy** | `evaluate(record) → {reviewNeeded, triageNeeded, flaggedFields}` — includes classification thresholds + missing DOI/auth aliases when expected |
| **MpiLookup** | Provider name → MPI spreadsheet match result |
| **EmailComposer** | Category-aware subject/HTML; MPI + pre-auth sections |
| **IntakeReader** | Label scan + category-specific processed labels |
| **DriveArchiver** | Save blob → URL |
| **AuditLogger** | Extended columns |
| **Orchestrator** | `run()` glue |

### Rollout

1. **Shadow mode:** all emails to tool owner only; tune classification thresholds, prompts, and MPI matching on real traffic.
2. Expand recipients once category accuracy and MPI match quality are acceptable.
3. Optionally enable category-specific CC (e.g. records mailbox for subpoenas) after shadow mode.

---

## Testing Decisions

Same philosophy as v1: assert **external behavior** of pure modules.

**Must test in v2:**

- **ResponseParser** — new fields (DOI, review #, referral ID, primary auth id derivation, preAuthorization object); malformed/partial JSON.
- **ReviewPolicy** — classification confidence bands; missing claim # on WC; missing all auth aliases; pre-auth banner conditions; triage-needed for `unknown`.
- **EmailComposer** — category in subject; MPI block states (found / ambiguous / not found); pre-auth section visibility; auth-alias subsection; records/subpoena "not an authorization" banner.
- **DocumentClassifier / extractor response handling** — mocked Gemini JSON for each category + low-confidence paths.
- **MpiLookup** — normalization + exact match, reorder match, ambiguous multi-match, no match (use fixture rows; no live Sheet in unit tests).

**Still not unit-tested in v2:** thin Gmail/Drive/Spreadsheet wrappers — validated in shadow mode.

---

## Out of Scope

- Writing extracted data into the practice management / insurance system.
- Automated dedup of re-faxed/corrected documents (audit log remains the foundation).
- Splitting multiple unrelated authorizations/referrals from a single fax.
- Sheet-as-primary UI (email remains primary; Sheet is audit + MPI is external reference data).
- Non-Google / non-BAA AI or OCR.
- Writing to or "owning" the MPI spreadsheet.
- Automated legal hold, production of records, or subpoena calendaring beyond summary email + audit row.
- Productization / external distribution.

---

## Configuration (Script Properties / owner setup)

| Key | Purpose |
|-----|---------|
| Intake label name | Default `Intake-Pending` |
| Processed label prefix | Default `Intake-Processed/` |
| MPI spreadsheet ID | Company MPI work-comp Sheet |
| MPI sheet/tab name | |
| MPI provider name column(s) | |
| MPI number column | |
| Recipient map by category | To/CC addresses |
| Classification confidence thresholds | Optional overrides |
| Shadow mode flag / override recipient | |

---

## Further Notes

- **Owner truth-checks (not build blockers):**
  1. BAA/PHI clearance for Workspace, Vertex AI, recipients, and read access to the MPI spreadsheet.
  2. Gmail filter criteria that catch WC, MVA, third-party/imaging, and records/subpoena e-faxes into the intake label despite inconsistent subjects/headers.
  3. GCP project link + Vertex AI + OAuth scopes.
  4. Confirm MPI sheet column layout with the spreadsheet owner before hard-wiring property keys.
- **Migration from v1:** if `WC-Auths` / `WC-Processed` already exist, Orchestrator should accept legacy label names via config during transition.
- **Publishing:** file this PRD as a GitHub issue with `ready-for-agent` when implementation is kicked off; keep v1 PRD as historical baseline.

---

## Summary of deltas from v1

| Area | v1 | v2 |
|------|----|----|
| Document types | WC auth only | WC auth/pre-auth, MVA, third-party/imaging referral, records/subpoena, unknown/triage |
| Classification | Implicit (all WC) | Explicit classifier + confidence thresholds |
| DOI | Not extracted | Extracted when present |
| Auth IDs | Authorization # only | Auth # + review # + referral ID + derived primary |
| Pre-authorization | Not modeled | Dedicated section / flags |
| MPI | None | Read-only spreadsheet lookup by referring provider |
| Labels | `WC-Auths` → `WC-Processed` | Intake pending → category-specific processed labels |
| Audit log | WC-focused columns | + category, confidence, DOI, auth aliases, pre-auth, MPI status |
