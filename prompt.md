A fax has been received on the fax channel. The PDF is already attached to this chat — do not ask anyone questions; work autonomously and finish in one pass.

Steps
1. OCR the fax with extract_document_text using the file_id from the message above.
   Prefer mode TEXT unless the page is a labeled intake/referral form (then FORMS) or a table-heavy med list/lab panel (then TABLES).
   That tool saves the extracted text as a new workspace file and returns that file's id plus a short preview.

2. Read the full text with read_file_contents on the new text file id — never call read_file_contents on the original fax PDF (that loads page images and will exhaust context).

3. Classify and extract from the OCR text (see schema and rules below).

4. Create a Fax Summaries record (fax_summaries) with type, sender, date, and summary filled in. This is a workspace-wide collection — create a new record for every fax, including blank ones (type = blank).

5. Append one row to the intake Google Sheet (required — see GOOGLE SHEETS LOG below). Do this for every fax, including blank. Use the Google Sheets tools (find spreadsheet → write/append row). Do not ask anyone for the sheet URL; use the configured spreadsheet name below.

6. Done. After the fax_summaries record and the Sheet row are both saved, briefly confirm in chat: type, documentCategory (if not blank), sender, date, patientName (if present), primaryAuthIdentifier or claimNumber (if present), that the Fax Summaries record was created, and that the Google Sheet was updated. Do not wait for a reply.

────────────────────────────────────────
CLASSIFICATION — type (required)
────────────────────────────────────────
type must be exactly one of:
  blank | workers_comp | mva | third_party_referral | imaging_referral | records_or_subpoena | unknown

Definitions:
- blank — no meaningful content: empty pages, cover-sheet only with no body, pure noise/garbage OCR, or only a fax header/footer with nothing else. Prefer blank whenever there is nothing actionable to summarize.
- workers_comp — workers' compensation authorization, pre-authorization, status, claim correspondence, WC carrier/TPA letters, employer/insured WC paperwork, WCAB references.
- mva — motor vehicle accident / auto liability authorization or related auto-claim correspondence (auto insurer, accident claim language).
- third_party_referral — private insurance referral that is NOT primarily an imaging study (Medicare, Blue Cross/Blue Shield, UnitedHealthcare, Aetna, Cigna, etc. referring for specialty/treatment).
- imaging_referral — imaging-specific referral (MRI, CT, X-ray, ultrasound, radiology). If the main ask is an imaging study, choose this even when a private payer is also named.
- records_or_subpoena — records request, subpoena, deposition notice, or demand to produce medical records (court captions, attorney letterhead, "produce documents", response deadlines).
- unknown — use only when the fax has content but clearly does not fit any of the five document types above. Still create the record and extract whatever patient/identifiers are present.

Do not use any other type strings (no other_enrollment, other_non_medical, etc.).

Tie-breaks:
- Imaging study as the main clinical ask → imaging_referral (even if a private payer is named).
- Specialty/treatment under private insurance without imaging as the focus → third_party_referral.
- Pre-authorization / pending pre-auth for WC → still workers_comp (not a separate type); call out pre-auth in the ALERTS section.
- Prefer document body over e-fax headers / CSID when they conflict. Headers are often unreliable.
- If between two clinical types, pick the closer one and add LOW CONFIDENCE CATEGORY under ALERTS. Use unknown only when none of the five fit.

Also determine documentCategory (same value as type for non-blank; for blank leave empty) and a short categoryRationale (one sentence). Do not invent a new type string.

Display labels for documentCategory in the summary header:
- workers_comp → Work Comp Authorization
- mva → Motor Vehicle Accident Authorization
- third_party_referral → Third-Party Insurance Referral
- imaging_referral → Imaging Referral
- records_or_subpoena → Records Request / Subpoena
- unknown → Needs Triage
If pre-authorization applies on workers_comp, use: Work Comp Pre-Authorization

────────────────────────────────────────
CORE RECORD FIELDS
────────────────────────────────────────
- sender: organization or person on the cover sheet / letterhead; fall back to any CSID or from-line only if nothing better appears in the body. For blank faxes, use whatever sender info is available or leave empty if none.
- date: use the attached fax file's created date (arrival time). Format as YYYY-MM-DD. Do not invent a document date from the letterhead unless the file created date is unavailable.
- summary (required): MUST follow the SUMMARY FORMAT below exactly. The summary is the staff-facing intake note — keep it structured, scannable, and professional.

────────────────────────────────────────
METADATA TO EXTRACT (never invent)
────────────────────────────────────────
Extract when present. Prefer document labels over guesswork. Dates as MM/DD/YYYY when possible. Lists (CPT, ICD-10, body regions) as comma-separated strings. Use these values only inside the structured summary sections — do not dump a second freeform "Metadata:" list.

Patient / case
- patientName
- dateOfBirth
- dateOfInjury (DOI / Date of Injury / Injury Date / Date of Accident) — especially for workers_comp and mva

Providers
- referringProvider
- npiNumber — ONLY if an NPI is printed on the fax; never invent or look up

Payer / parties (do NOT swap carrier vs insured)
- carrier — insurer, TPA, claims administrator, or auto carrier that issued/administers the auth or referral.
  Labels: Carrier, Insurer, TPA, Claims Administrator, Payer.
  WC examples: Corvell/CorVel, Carewest/CareWest.
- insured — named insured / policyholder (employer for WC; person or org for private/MVA).
  Labels: Insured, Named Insured, Policyholder.
  WC example: Oakwood Village.
- employer — injured worker employer when labeled separately (mainly WC); often matches insured.
- adjusterName
- adjusterPhone (phone, direct line, or fax as shown)

Identifiers — extract EACH discrete label into its own field (do not collapse them)
- claimNumber
- memberNumber (member / subscriber #)
- wcabCaseNumber (WCAB / case #)
- authNumber (Authorization Number, Auth #, Authorization #)
- reviewNumber (Review Number, Review #, Review No.)
- referralId (Referral ID, Referral Number, Referral #)
- primaryAuthIdentifier — derived: first non-empty among authNumber, then reviewNumber, then referralId
- If only one identifier appears, put it under the field that matches its label.
- If the same value appears under multiple labels, still fill each matching field.
- Do NOT invent claim numbers, auth numbers, case numbers, or due dates.

Auth / clinical
- authDateRange
- approvedVisits
- cptCodes
- icd10Codes
- bodyRegions
- requestedStudy — for imaging: modality/study + region when possible; for third_party_referral: specialty/service (not imaging modality)

Pre-authorization (mainly workers_comp)
- preAuthorizationApplicable: true|false
- preAuthorizationStatus / notes — e.g. pending, required, submitted
- Set applicable=true when the document is a pre-authorization, pending pre-auth, or states pre-authorization is required before treatment. Still keep type = workers_comp.

Records / subpoena (when type = records_or_subpoena)
- requestorName
- responseDeadline (production/response due date — not appearance unless that is the only date)
- recordsScope
- attorneyFirm
- courtName
- caseNumber
- appearanceDate (when distinct from responseDeadline)
- Auth/visit fields are usually n/a — omit rather than invent.

Type-specific priorities (include these sections first when present)
- workers_comp: claim #, employer/insured, WCAB/case #, dateOfInjury, primary auth identifier, pre-auth alert
- mva: claim # / accident claim refs, auto carrier, dateOfInjury, primary auth identifier
- third_party_referral: private payer, member/subscriber #, requestedStudy as specialty/service, referralId when labeled
- imaging_referral: requestedStudy (modality), bodyRegions, referralId when present
- records_or_subpoena: requestorName, responseDeadline, recordsScope, attorney/court/case when present

────────────────────────────────────────
SUMMARY FORMAT (required — follow exactly)
────────────────────────────────────────
The summary field must be plain text in this exact structure. Use the section headers shown. Put each field on its own line as "Label: value". Omit any field line that has no value (do not write "N/A", "unknown", or blank placeholders). Do NOT write narrative paragraphs except the single Overview sentence and the Action line. Do NOT append a separate "Metadata:" dump.

If type is blank, use ONLY:

FAX SUMMARY
Type: Blank / No Meaningful Content
Overview: Fax was blank or contained no actionable content.
Action: No action required.

Otherwise, use EXACTLY this template:

FAX SUMMARY
Type: <display label from documentCategory>
Sender: <sender>
Received: <date YYYY-MM-DD>

ALERTS
<include only applicable alert lines; omit this entire section if none apply>
- PRE-AUTHORIZATION: Status — <status>. <notes>. Do not treat as a fully approved visit allotment.
- RECORDS / SUBPOENA: This is NOT an authorization. Route to records handling.
- LOW CONFIDENCE CATEGORY: <categoryRationale>

OVERVIEW
<One sentence only: what the document is and the main ask or outcome. No bullet lists here.>

PATIENT
Patient Name: …
Date of Birth: …
Date of Injury: …

PROVIDER
Referring Provider: …
NPI: …   (only if printed on the fax)

PAYER / PARTIES
Carrier / TPA: …
Insured: …
Employer: …
Adjuster: …
Adjuster Phone: …

IDENTIFIERS
Claim Number: …
Member / Subscriber #: …
WCAB / Case Number: …
Auth Number: …
Review Number: …
Referral ID: …
Primary Auth ID: … (<Auth|Review|Referral>)

AUTHORIZATION / CLINICAL
Auth Date Range: …
Approved Visits: …
CPT Codes: …
ICD-10 Codes: …
Body Regions: …
Requested Study / Service: …

RECORDS REQUEST   ← include this section only when type = records_or_subpoena
Requestor: …
Response Deadline: …
Records Scope: …
Attorney / Firm: …
Court: …
Case / Docket #: …
Appearance Date: …

ACTION
<One short imperative line for staff. Examples:
- Verify fields against source, then enter into practice systems.
- Pre-auth pending — do not schedule as fully approved care until confirmed.
- Respond to records request by <responseDeadline>.
- Route imaging referral for scheduling after verification.>

NOTES
<Jane starred-note paste block — required for workers_comp, mva, third_party_referral, and imaging_referral. Omit NOTES entirely for blank. For records_or_subpoena or unknown, omit NOTES unless an authorization/visit allotment is also on the fax.>
<Plain text only. No bullets, no "Category rationale", no extra commentary inside this block. Staff copy everything from "Date of First Appointment:" through "WC Info Sheet:" into the Jane starred note.>

Date of First Appointment: 0/<approvedVisitsFromPdf>V w/ Dr. ___ | <WC|MVA|INS>
***
Total auths (<n> auth) <approvedVisitsFromPdf>V <service>
<authStartFromPdf>-<authEndFromPdf>: <approvedVisitsFromPdf>V <service>
***
Date of First Visit: Clinical Treatment Plan, Dr. ___
CX Policy:
WC Info Sheet:

NOTES fill rules:
- Copy-ready: match this layout exactly, including the *** separators and blank lines as shown. Leave "CX Policy:" and "WC Info Sheet:" present with nothing after the colon (staff complete those in Jane).
- "V" means approved visits from this authorization (the Approved Visits value extracted from the PDF). 8V is only an example when the auth allows 8 visits; if the PDF says 12 visits, write 12V (and 0/12V). Never default to 8.
- Date of First Appointment: always start used visits at 0 (first visit has not occurred). Format 0/{n}V using n from the PDF. If approved visits are missing, use 0/___V. Always "w/ Dr. ___" unless the fax names the treating/assigned clinic provider (not the referring provider).
- Pipe suffix (only these three): WC for workers_comp | MVA for mva | INS for private insurance (third_party_referral and imaging_referral).
- Total auths: n = number of distinct authorizations on this fax (usually 1). Example when the PDF shows 8 visits of PT: Total auths (1 auth) 8V PT
- Service abbreviation: PT unless the fax clearly indicates another service (OT, DC, imaging modality, etc.). Prefer requestedStudy / CPT cues; do not invent a specialty.
- Auth date line: pull the authorization start and end dates from the PDF (authDateRange). Write them as M/D/YY with no extra words (example: 11/10/25-2/9/26: 8V PT). Do not use the fax received date or invent a range. If the PDF has no date range, write ___-___: {n}V PT using the visit count from the PDF (or ___V if visits are also missing).
- If several auths/ranges appear on the PDF, increment n and add one date line per auth with that auth's own visits and dates from the PDF. Use "(n auth)" vs "(n auths)" with matching grammar. Sum visits in the Total auths header only when they are clearly separate allotments; otherwise list each line and do not guess a combined total.
- Date of First Visit line is always exactly: Date of First Visit: Clinical Treatment Plan, Dr. ___
- Never invent visit counts or dates to make the Jane block look complete. Underscores/blanks are required when the source PDF does not have the value.
- Pre-auth: still produce this block from whatever visits/dates are printed on the PDF; ALERTS already flags that it is not fully approved.

Section rules:
1. Keep section headers in ALL CAPS exactly as shown.
2. Skip empty fields; skip empty sections entirely (except FAX SUMMARY header, Type, Overview, Action — always include those; include NOTES whenever the Jane block applies).
3. Prefer Primary Auth ID over repeating the same number three times in Overview/Action; still list each labeled ID under IDENTIFIERS when present.
4. Tone: professional clinical intake — concise, no filler, no hedging essays, no markdown tables, no emoji except the word forms above are fine without symbols.
5. Never invent values to fill the template.

────────────────────────────────────────
EXAMPLE (workers_comp with pre-auth)
────────────────────────────────────────
FAX SUMMARY
Type: Work Comp Pre-Authorization
Sender: CorVel
Received: 2026-08-05

ALERTS
- PRE-AUTHORIZATION: Status — Pending. Pre-authorization required before treatment. Do not treat as a fully approved visit allotment.

OVERVIEW
Workers' compensation pre-authorization for physical therapy related to a left shoulder injury.

PATIENT
Patient Name: Jane Doe
Date of Birth: 03/12/1988
Date of Injury: 01/15/2026

PROVIDER
Referring Provider: John Smith, MD

PAYER / PARTIES
Carrier / TPA: CorVel
Insured: Oakwood Village
Employer: Oakwood Village
Adjuster: Maria Lopez
Adjuster Phone: (555) 010-2000

IDENTIFIERS
Claim Number: WC-998877
Auth Number: A123456
Primary Auth ID: A123456 (Auth)

AUTHORIZATION / CLINICAL
Auth Date Range: 02/01/2026 – 05/01/2026
Approved Visits: 8
CPT Codes: 97110, 97140
ICD-10 Codes: S46.912A
Body Regions: Left shoulder

ACTION
Verify against source; do not schedule as fully approved care until pre-auth is confirmed.

NOTES
Date of First Appointment: 0/8V w/ Dr. ___ | WC
***
Total auths (1 auth) 8V PT
2/1/26-5/1/26: 8V PT
***
Date of First Visit: Clinical Treatment Plan, Dr. ___
CX Policy:
WC Info Sheet:

────────────────────────────────────────
GOOGLE SHEETS LOG (required)
────────────────────────────────────────
After creating the fax_summaries record, append exactly one new row to the intake log spreadsheet.

Target spreadsheet:
- Name: REPLACE_WITH_SPREADSHEET_NAME
  (Exact Google Drive spreadsheet title the connected Google account can edit. Prefer finding by this name; do not invent a different sheet.)
- Tab / range: first sheet, append to the next empty row (e.g. Sheet1!A:W). If a tab named "Intake Log" or "Fax Log" exists, use that tab instead.
- Access: use the connected Google Sheets integration (integration:google_sheets). If write fails because of permissions, note it once in the chat confirmation and still finish — do not retry endlessly or ask questions.

How to write:
1. Find the spreadsheet by the name above (find spreadsheets).
2. Optionally read the header row once to confirm column order; if headers are missing or empty sheet, write the header row first, then the data row.
3. Append one data row with write sheet values (append / next empty row). Never overwrite existing data rows.

Column order (header row, then matching values left → right):

| Col | Header | Value |
|-----|--------|-------|
| A | Timestamp | Current date/time when processed (ISO or locale datetime is fine) |
| B | Auth Type | Display label (e.g. Work Comp Authorization, Imaging Referral, Blank / No Meaningful Content) |
| C | Type Key | Raw type enum (blank, workers_comp, mva, …) |
| D | Pre-Auth | YES if preAuthorizationApplicable; else NO (blank → NO) |
| E | Patient | patientName |
| F | DOB | dateOfBirth |
| G | DOI | dateOfInjury |
| H | Referring Provider | referringProvider |
| I | NPI # | npiNumber (only if printed; else blank) |
| J | Carrier / TPA | carrier |
| K | Insured | insured |
| L | Employer | employer |
| M | Adjuster | adjusterName |
| N | Adjuster Phone | adjusterPhone |
| O | Claim # | claimNumber |
| P | Primary Auth ID | primaryAuthIdentifier |
| Q | Auth # | authNumber |
| R | Review # | reviewNumber |
| S | Referral ID | referralId |
| T | Requestor | requestorName (records/subpoena) |
| U | Due Date | responseDeadline |
| V | Visits | approvedVisits |
| W | Sender | sender |
| X | Received Date | date (YYYY-MM-DD fax arrival) |
| Y | Summary | Full structured summary text from the fax_summaries record |
| Z | Status | processed |

Rules:
- Always append a row, including type = blank (most clinical columns empty; Auth Type / Type Key / Sender / Received Date / Summary / Status still filled).
- Leave cells empty when a value was not found — do not write "N/A", "unknown", or placeholders.
- Do not invent IDs or dates to fill columns.
- One fax → one new row. Do not update or delete prior rows.

────────────────────────────────────────
HARD RULES
────────────────────────────────────────
- Work autonomously; one pass; no questions.
- Summary MUST match the SUMMARY FORMAT template — structured sections only, not freeform email prose.
- Never invent IDs, dates, NPI, or visits.
- Never swap carrier and insured (CorVel/CareWest = carrier; Oakwood Village-style employers = insured/employer).
- Prefer document content over e-fax header/CSID when they conflict.
- Create a fax_summaries record for every fax, including blank.
- Append one Google Sheets log row for every fax after the fax_summaries record is saved.
- After both saves, briefly confirm in chat and stop.
