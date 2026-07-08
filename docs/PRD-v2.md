# PRD v2: Intake Document Classifier & Work-Comp Tracker

**Status:** v1 is already implemented and deployed as a live Google Apps Script project. v2 below is an **incremental update to that existing deployment**, not a greenfield build — see "Existing deployment & incremental-update strategy" under Implementation Decisions before starting, and [Implementation Guide v2](./IMPLEMENTATION-GUIDE-v2.md) for concrete step-by-step instructions and code.  
**Platform:** Google Apps Script (JavaScript), container-bound to the audit-log Google Sheet  
**Owner:** Front-desk / WC intake (personal internal tool)  
**Supersedes / extends:** [PRD v1](./PRD.md) (Work-Comp Authorization Extractor)

---

## Problem Statement

v1 solved the core pain of manually reading work-comp authorization faxes and emailing a verify-against-source field summary. In practice, the same inbox also receives **motor vehicle accident (MVA)** packets, **third-party / imaging referrals**, and **records / subpoena requests** — often from inconsistent e-fax senders and subject lines. Staff still have to open each message, figure out what kind of document it is, and route it mentally.

Separately, when setting up a work-comp case, the front desk must look up the referring provider in the company's **work-comp provider spreadsheet** to find whether an **NPI number** already exists on file. That lookup is easy to miss and slows intake.

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
3. **Cross-references** the referring provider name against the company's **work-comp provider spreadsheet** and surfaces any matching **NPI number** in the email (so staff do not dig for it).
4. **Emails** a per-document summary with category in the subject, confidence flags, a Drive link to the source, and never silently drops a document.

Output remains an **assist, not an authority**: humans verify against the source before keying data into practice systems.

## Goals (v2)

- Reduce time spent identifying *what kind of document* arrived.
- Surface NPI numbers via spreadsheet lookup when the referring provider matches.
- Capture date of injury and all common aliases for the authorization identifier.
- Call out pre-authorization when present or required.
- Keep PHI inside Workspace + Vertex AI; no consumer Gemini API; no service-account key files.

## Non-Goals (v2)

Same as v1, plus:

- Automatically writing into the practice management system.
- Fully automated legal response to subpoenas (classification + summary only; humans handle fulfillment).
- Replacing the NPI spreadsheet as a system of record (read/lookup only in v2).
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
40. As the WC coordinator, I want the tool to look up the referring provider in the **work-comp provider spreadsheet** and show any matching **NPI number**, so that I do not dig through the sheet manually.
41. As the WC coordinator, I want fuzzy / normalized provider-name matching (e.g. "Smith, John" vs "John Smith, MD"), so that minor name formatting differences still find the NPI row.
42. As the WC coordinator, I want ambiguous NPI matches (multiple possible rows) flagged for manual confirmation, so that the wrong NPI number is never presented as certain.
43. As the intake staff, I want MVA packets summarized with the fields that matter for MVA intake (patient, DOI if present, referring provider, insurer/adjuster when present, key IDs), so that MVA mail is actionable in the same workflow.
44. As the intake staff, I want third-party / imaging referrals summarized with patient, referring provider, requested study/service, and any referral/auth IDs, so that imaging referrals are not mixed into WC auth setup.
45. As the records staff, I want records requests and subpoena requests categorized and summarized (requestor, patient identifiers, due date if present, scope of records), so that legal/records demand is visible and not mistaken for an authorization.
46. As the manager, I want the audit log to record document category and classification confidence, so that volume and misclassification can be reviewed.
47. As the tool owner, I want category-specific Gmail labels after processing (or a category field in the email + audit log), so that processed mail remains findable by type.
48. As the tool owner, I want shadow-mode rollout for classification + NPI lookup before expanding recipients, so that false categories and wrong NPI matches are tuned on real mail first.

---

## Implementation Decisions

### Existing deployment & incremental-update strategy (v2 planning)

v1 is already built and running as a live Apps Script project (not starting from scratch). This section exists to calibrate expectations about how much of v2 is a **configuration change** (editing your existing config JSON — referred to here as `apps.json`, whatever its actual filename is in your project — or Script Properties) versus a **code change** (editing `.gs` files: new functions, new modules, new template branches).

This repo currently contains only documentation (no `.gs`/`.json` source), so the split below is a best-effort estimate based on common Apps Script + Gemini structured-extraction patterns, not a review of your actual code. Two things would let a future pass be exact instead of estimated:

1. Pull your live project into this repo with `clasp pull` (or paste the relevant files) so the plan can reference real function/field names.
2. Confirm the three "quick self-check" questions below, since they determine which rows in the table are realistically config-only for your project.

For concrete, ready-to-adapt code for every phase below, see [Implementation Guide v2](./IMPLEMENTATION-GUIDE-v2.md).

**Quick self-check (answer these against your real code before starting):**

1. Does your Gemini call use a **structured `responseSchema`** (JSON Schema passed in `generationConfig`) to define extracted fields, and is that schema stored in a separate JSON file/config rather than inlined as a hardcoded object in a `.gs` file? If yes, adding new *scalar* fields (like DOI) to that schema is genuinely config-only.
2. Does `ResponseParser` **pass through whatever fields the schema declares**, or does it use a hardcoded allow-list / typed object per field? A hardcoded allow-list means new fields need a small code change even if the schema itself is config-driven.
3. Does `EmailComposer` render fields **generically from a field-list config** (e.g., "for each field in this category's config, render a row"), or does it have **hardcoded HTML per field**? Hardcoded HTML means every new field/section (pre-authorization block, NPI block, category banner) needs a template edit regardless of config.

**Config-only vs. code-change estimate per v2 requirement:**

| v2 requirement | Likely config-only (`apps.json` / Script Properties)? | Why |
|---|---|---|
| Date of injury (DOI) field | **Likely yes**, if self-check #1 and #2 are both "yes" | It's a new scalar field with no new business logic attached — just another value to extract and display. |
| Review # / Referral ID # fields (raw values) | **Likely yes**, same conditions as DOI | Same as above — new scalar fields. |
| Primary auth identifier (derived: first non-empty of auth #/review #/referral ID) | **No — needs a small code change** | This is new derivation logic (a pick-first-non-empty function with a priority order) that v1 never had, even though the *priority order itself* can be config. |
| Pre-authorization section (`preAuthorization` object + banner) | **No — needs a code change** | New nested object shape, a new `ReviewPolicy` rule, and a new `EmailComposer` template block. The field *content* can be schema-driven; the rendering and flagging logic is not. |
| NPI lookup (`NpiLookup` module) | **No — needs a code change** | This is a wholly new capability: reading a second spreadsheet, normalizing provider names, and fuzzy-matching. Only the spreadsheet ID/tab/column names and match thresholds are config; the matching logic itself must be written. |
| Document classification (`category` + confidence) | **Partly** — the `category` field + enum can be schema/config-driven if self-check #1 is "yes" | But the branching logic that *acts* on the category (which template to render, which label to apply, which recipients to CC, which confidence thresholds trigger which banner) is new orchestration/`ReviewPolicy` code. Threshold *values* can be config. |
| Category-specific processed Gmail labels | **No — needs a code change** | `IntakeReader`/Orchestrator currently does one fixed label swap; routing to one of several labels based on category is new logic. Label *names* can be config. |
| Category-aware email subjects/sections | **No — needs a code change**, unless self-check #3 is "yes" | If `EmailComposer` is already generic/field-list-driven, this could be mostly config. If it has hardcoded per-field HTML (common in v1-scale projects), each category needs a new template branch. |
| Audit log new columns | **No — needs a code change**, unless `AuditLogger` already takes a generic key-value map | New values need new `appendRow` calls; the column *set* could be config-driven if the logger was built generically, but v1's described interface (`log(authRecord, recipients, reviewNeeded)`) suggests fixed positional columns, which means a code change. |
| Confidence thresholds, recipient maps, label names, NPI spreadsheet ID/columns | **Yes — pure config** | These are exactly what `apps.json`/Script Properties should hold regardless of how the rest of the code is structured. If they're currently hardcoded in `.gs` files, moving them into config is a good (small) side quest while doing this update. |

**Recommended sequence for the update:**

1. Locate your existing config file/mechanism (`apps.json`, Script Properties, or both) and confirm which of the config-only rows above already live there vs. are hardcoded — this determines your real effort, not the estimate above.
2. Add the new scalar extraction fields (DOI, review #, referral ID, category) to the schema/config first — lowest-risk change, testable in isolation against a few real faxes in shadow mode.
3. Write the `NpiLookup` module (new code) and wire its config (sheet ID/tab/columns/thresholds) into `apps.json`/Script Properties rather than hardcoding it.
4. Add the primary-auth-identifier derivation and `preAuthorization` handling to `ResponseParser`/`ReviewPolicy` (small, isolated code changes).
5. Add category-based branching to the Orchestrator (label routing) and `EmailComposer` (subject prefix, category sections, NPI block, pre-auth block, records/subpoena banner).
6. Extend `AuditLogger` columns last, once the record shape is stable.
7. Re-run a **targeted** shadow-mode pass (see Rollout below) focused on the new fields/categories/NPI matches rather than re-validating everything v1 already proved out.

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
  - `wc_authorization` (pre-authorization is **not** a separate category — see Pre-authorization below; use `preAuthorization.applicable` on this same category)
  - `mva`
  - `third_party_referral` (includes imaging referrals)
  - `records_or_subpoena`
  - `unknown`
- **Confidence policy (initial defaults; tunable in shadow mode):**
  - `confidence >= 0.80` → treat as classified; proceed with category-specific extraction + email.
  - `0.50 <= confidence < 0.80` → email still sends with **⚠️ LOW CONFIDENCE CATEGORY — VERIFY TRIAGE**; use best-guess category for extraction template but banner for manual sort.
  - `confidence < 0.50` or `unknown` → email marked **⚠️ NEEDS MANUAL TRIAGE**; minimal/generic extraction; processed label `Needs-Triage`.
- Prefer a **single Gemini call** that returns both classification and extraction JSON when practical (lower latency/cost); keep classifier logic separable so thresholds can change without rewriting prompts.
- **Two distinct confidence concepts — do not conflate them:**
  1. **Classification confidence** (new in v2) — how sure the model is about the document *category*, per this policy.
  2. **Field-level confidence** (from v1, unchanged) — how sure the model is about each individual *extracted field* (patient name, claim #, etc.), independent of category. A document can be classified with high confidence while individual fields inside it are low-confidence, and vice versa. `ReviewPolicy` evaluates both and returns them separately (`triageNeeded` for classification, `reviewNeeded`/`flaggedFields` for fields).

### Extraction field set (v2)

**Shared / common fields (extract when present, all categories):**

| Field | Notes |
|-------|--------|
| Patient name | |
| DOB | |
| Date of injury (DOI) | **New in v2** — extract when present |
| Referring provider | Used for display + NPI lookup |
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
- **Single representation (final):** a WC pre-auth document is always classified as category `wc_authorization` with `preAuthorization.applicable = true` — there is no separate `wc_preauthorization` category. This keeps WC field templates, `ReviewPolicy`, and `EmailComposer` unified around one category. The email subject prefix is derived from the flag: `[WC Auth]` when `preAuthorization.applicable` is false, `[WC Pre-Auth]` when it's true (see Output / email below).

**Category-specific emphasis (email sections, not hard schema forks):**

- **WC auth / pre-auth:** full WC field set + NPI lookup + pre-auth block.
- **MVA:** patient, DOI, referring provider, insurer/adjuster, claim/policy IDs when present; WC-only fields omitted or shown as "n/a" if absent.
- **Third-party / imaging referral:** patient, referring provider, requested study/service, referral/auth IDs, ICD if present.
- **Records / subpoena:** requestor, patient identifiers, due date, scope; auth/visit fields usually n/a; strong banner that this is **not** an authorization.

### Work-comp provider spreadsheet integration → NPI lookup (new)

- The lookup source is **the company's existing work-comp provider spreadsheet** — an existing internal roster, not a document created for this project — which happens to record each provider's NPI number. It's referred to as "the NPI spreadsheet" throughout this PRD for brevity, but that's a reference to its contents, not necessarily its literal title.
- **NpiLookup** module: `lookupByProviderName(name) → { status, npiNumber?, matchedName?, candidates?, confidence }`, where `status` is one of `matched | ambiguous | not_found`.
- Spreadsheet ID/tab/column mapping lives in Script Properties — not hard-coded secrets; the sheet ID itself is configuration, not a credential.
- **Read-only** in v2: never write back to the NPI spreadsheet.
- Matching approach:
  1. Normalize extracted provider name (strip credentials MD/DO/PT, punctuation, extra whitespace; case-fold; optional last-name-first ↔ first-last reorder).
  2. Scan configured provider-name column(s); score candidates (exact normalized match > token overlap).
  3. **Single high-confidence match** (`status: matched`) → include NPI number in email as a confirmed lookup result (still verify-against-source framing for the fax fields; NPI is "from company spreadsheet").
  4. **Multiple plausible matches** (`status: ambiguous`) → list top candidates in email under **⚠️ NPI MATCH AMBIGUOUS**; do not pick silently.
  5. **No match** (`status: not_found`) → show **NPI: not found in spreadsheet** (not an error; coordinator may still proceed).
- **Optional data-quality guard:** sanity-check that a matched NPI is exactly 10 digits before displaying it as confirmed; a non-conforming value from the spreadsheet is a spreadsheet data issue, not a lookup failure, but should still downgrade the result to "unverified format" rather than silently presenting a malformed number as trustworthy.
- NPI lookup runs by default for WC auth/pre-auth. Whether it also runs for MVA and third-party referral (categories where a referring provider is also commonly present) is configurable via `NPI lookup categories` (see Configuration) rather than hard-coded, so it can be enabled once shadow-mode testing shows the extra lookups are useful for those categories. Skipped for records/subpoena by default unless a provider name was extracted and the category is added to that config list.
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
  - **NPI number** block (match / ambiguous / not found)
  - **Pre-authorization** block when applicable
  - Auth identifier subsection listing authorization #, review #, referral ID (and which was chosen as primary)
  - For `records_or_subpoena`: a prominent **"This is not an authorization"** banner, since auth/visit fields are normally absent for this category and staff should not mistake it for an approved auth
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
- NPI number (or match status)
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
| **NpiLookup** | Provider name → NPI spreadsheet match result |
| **EmailComposer** | Category-aware subject/HTML; NPI + pre-auth sections |
| **IntakeReader** | Label scan + category-specific processed labels |
| **DriveArchiver** | Save blob → URL |
| **AuditLogger** | Extended columns |
| **Orchestrator** | `run()` glue |

### Rollout

Since v1 is already live with real recipients, v2's rollout is a **targeted re-validation of only what's new**, not a full re-run of v1's original shadow period:

1. **Shadow the new surface area only:** temporarily route emails for newly-classified categories (MVA, third-party/imaging, records/subpoena) and any WC auth with an NPI match or pre-authorization block to the tool owner only, while WC auths that don't hit any new logic can continue going to real recipients as they do today. (If that selective routing is impractical to implement quickly, a short full shadow period is the fallback — but it's not required by default the way it was for the v1 launch.)
2. Tune classification thresholds, the new field prompts/schema, and NPI matching against real traffic during this window.
3. Expand the newly-classified categories to real recipients once category accuracy and NPI match quality are acceptable.
4. Optionally enable category-specific CC (e.g. records mailbox for subpoenas) after validation.

---

## Testing Decisions

Same philosophy as v1: assert **external behavior** of pure modules.

**Must test in v2:**

- **ResponseParser** — new fields (DOI, review #, referral ID, primary auth id derivation, preAuthorization object); malformed/partial JSON.
- **ReviewPolicy** — classification confidence bands; missing claim # on WC; missing all auth aliases; pre-auth banner conditions; triage-needed for `unknown`.
- **EmailComposer** — category in subject; NPI block states (found / ambiguous / not found); pre-auth section visibility; auth-alias subsection; records/subpoena "not an authorization" banner.
- **DocumentClassifier / extractor response handling** — mocked Gemini JSON for each category + low-confidence paths.
- **NpiLookup** — normalization + exact match, reorder match, ambiguous multi-match, no match (use fixture rows; no live Sheet in unit tests).

**Still not unit-tested in v2:** thin Gmail/Drive/Spreadsheet wrappers — validated in shadow mode.

---

## Out of Scope

- Writing extracted data into the practice management / insurance system.
- Automated dedup of re-faxed/corrected documents (audit log remains the foundation).
- Splitting multiple unrelated authorizations/referrals from a single fax.
- Sheet-as-primary UI (email remains primary; Sheet is audit + NPI is external reference data).
- Non-Google / non-BAA AI or OCR.
- Writing to or "owning" the NPI spreadsheet.
- Automated legal hold, production of records, or subpoena calendaring beyond summary email + audit row.
- Productization / external distribution.

---

## Configuration (`apps.json` / Script Properties / owner setup)

These are the values that should live in configuration (whether that's your `apps.json`, Script Properties, or a mix) rather than being hardcoded in `.gs` files, so future tuning doesn't require code edits:

| Key | Purpose |
|-----|---------|
| Intake label name | Default `Intake-Pending` |
| Processed label prefix | Default `Intake-Processed/` |
| NPI spreadsheet ID | Company's work-comp provider Sheet (contains NPI numbers) |
| NPI sheet/tab name | |
| NPI provider name column(s) | |
| NPI number column | |
| Recipient map by category | To/CC addresses |
| Classification confidence thresholds | Optional overrides |
| NPI lookup categories | Which document categories trigger an NPI lookup (default: WC auth/pre-auth only) |
| Shadow mode flag / override recipient | |

---

## Further Notes

- **Owner truth-checks (not build blockers):**
  1. BAA/PHI clearance for Workspace, Vertex AI, recipients, and read access to the NPI spreadsheet.
  2. Gmail filter criteria that catch WC, MVA, third-party/imaging, and records/subpoena e-faxes into the intake label despite inconsistent subjects/headers.
  3. GCP project link + Vertex AI + OAuth scopes.
  4. Confirm NPI sheet column layout with the spreadsheet owner before hard-wiring property keys.
- **Open product decision — records vs. subpoena:** v2 ships records requests and subpoena requests as a single `records_or_subpoena` category (both are "not an authorization, route to records handling"). If the owner finds these need different recipients, due-date handling, or audit columns in practice, splitting them into two categories is a small, additive change (new enum value + label + email template) and can be done post-shadow-mode without disturbing the other categories.
- **Migration from v1:** if `WC-Auths` / `WC-Processed` already exist, Orchestrator should accept legacy label names via config during transition.
- **Getting an exact (not estimated) implementation plan:** this repo doesn't currently contain the live Apps Script source. Pulling it in (e.g. `clasp clone`/`clasp pull` into a `src/` folder here, or pasting the key files — especially `apps.json`/config, `AuthExtractor`, `ResponseParser`, `EmailComposer`) would let the config-vs-code breakdown above be replaced with a precise, file-by-file diff plan instead of an estimate.
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
| NPI | None | Read-only spreadsheet lookup by referring provider |
| Labels | `WC-Auths` → `WC-Processed` | Intake pending → category-specific processed labels |
| Audit log | WC-focused columns | + category, confidence, DOI, auth aliases, pre-auth, NPI status |
