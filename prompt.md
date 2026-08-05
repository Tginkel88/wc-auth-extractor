A fax has been received on the fax channel. The PDF is already attached to this chat — do not ask anyone questions; work autonomously and finish in one pass.

Steps
1. OCR the fax with extract_document_text using the file_id from the message above.
   Prefer mode TEXT unless the page is a labeled intake/referral form (then FORMS) or a table-heavy med list/lab panel (then TABLES).
   That tool saves the extracted text as a new workspace file and returns that file's id plus a short preview.

2. Read the full text with read_file_contents on the new text file id — never call read_file_contents on the original fax PDF (that loads page images and will exhaust context).

3. Classify and extract from the OCR text (see schema and rules below).

4. Create a Fax Summaries record (fax_summaries) with type, sender, date, and summary filled in. This is a workspace-wide collection — create a new record for every fax, including blank ones (type = blank).

5. Done. After the record is saved, briefly confirm in chat: type, documentCategory (if not blank), sender, date, patientName (if present), primaryAuthIdentifier or claimNumber (if present), and that the Fax Summaries record was created. Do not wait for a reply.

────────────────────────────────────────
CLASSIFICATION — type (required)
────────────────────────────────────────
type must be exactly one of:
  blank | workers_comp | mva | third_party_referral | imaging_referral | records_or_subpoena | other_enrollment | other_non_medical

Definitions:
- blank — no meaningful content: empty pages, cover-sheet only with no body, pure noise/garbage OCR, or only a fax header/footer with nothing else. Prefer blank whenever there is nothing actionable to summarize.
- workers_comp — workers' compensation authorization, pre-authorization, status, claim correspondence, WC carrier/TPA letters, employer/insured WC paperwork, WCAB references.
- mva — motor vehicle accident / auto liability authorization or related auto-claim correspondence (auto insurer, accident claim language).
- third_party_referral — private insurance referral that is NOT primarily an imaging study (Medicare, Blue Cross/Blue Shield, UnitedHealthcare, Aetna, Cigna, etc. referring for specialty/treatment).
- imaging_referral — imaging-specific referral (MRI, CT, X-ray, ultrasound, radiology). If the main ask is an imaging study, choose this even when a private payer is also named.
- records_or_subpoena — records request, subpoena, deposition notice, or demand to produce medical records (court captions, attorney letterhead, "produce documents", response deadlines).
- other_enrollment — insurance/plan enrollment, eligibility, or coverage paperwork that is not workers' comp and not one of the clinical referral/auth types above.
- other_non_medical — everything else that is not clinical care documentation in the above buckets.

Tie-breaks:
- Imaging study as the main clinical ask → imaging_referral (even if a private payer is named).
- Specialty/treatment under private insurance without imaging as the focus → third_party_referral.
- Pre-authorization / pending pre-auth for WC → still workers_comp (not a separate type); call out pre-auth in the summary.
- Prefer document body over e-fax headers / CSID when they conflict. Headers are often unreliable.

Also determine documentCategory (same value as type for non-blank; for blank leave empty) and a short categoryRationale (one sentence). If unsure, still pick the best type and note uncertainty in the summary — do not invent a new type string.

────────────────────────────────────────
CORE RECORD FIELDS
────────────────────────────────────────
- sender: organization or person on the cover sheet / letterhead; fall back to any CSID or from-line only if nothing better appears in the body. For blank faxes, use whatever sender info is available or leave empty if none.
- date: use the attached fax file's created date (arrival time). Format as YYYY-MM-DD. Do not invent a document date from the letterhead unless the file created date is unavailable.
- summary (required): see Summary rules below.

────────────────────────────────────────
METADATA TO EXTRACT (put into summary; leave out if absent — never invent)
────────────────────────────────────────
Extract when present. Prefer document labels over guesswork. Dates as MM/DD/YYYY when possible. Lists (CPT, ICD-10, body regions) as comma-separated strings.

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
  WC examples seen in this practice: Corvell/CorVel, Carewest/CareWest.
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

Type-specific priorities
- workers_comp: claim #, employer/insured, WCAB/case #, dateOfInjury, primary auth identifier, pre-auth flag
- mva: claim # / accident claim refs, auto carrier, dateOfInjury, primary auth identifier
- third_party_referral: private payer, member/subscriber #, requestedStudy as specialty/service, referralId when labeled
- imaging_referral: requestedStudy (modality), bodyRegions, referralId when present
- records_or_subpoena: requestorName, responseDeadline, recordsScope, attorney/court/case when present

────────────────────────────────────────
SUMMARY RULES (required)
────────────────────────────────────────
If type is blank:
  One short sentence stating the fax was blank / had no meaningful content (still create the record).

Otherwise:
  Write 2–5 sentences that cover:
  1) What the fax is (use the documentCategory wording), and whether it is a pre-authorization if applicable.
  2) Key people/orgs: patientName, referringProvider, carrier, insured/employer, adjuster when present.
  3) Key identifiers: claimNumber, primaryAuthIdentifier (and which label: auth/review/referral), memberNumber, wcabCaseNumber, DOI, DOB when present.
  4) Clinical/auth detail when present: authDateRange, approvedVisits, CPT/ICD-10, bodyRegions, requestedStudy.
  5) Any action required (e.g. verify before scheduling; respond by responseDeadline for records/subpoena; pre-auth pending — do not treat as fully approved visits).

Then append a compact metadata block (omit empty lines):

Metadata:
- documentCategory: …
- patientName: …
- dateOfBirth: …
- dateOfInjury: …
- referringProvider: …
- npiNumber: …   (only if printed)
- carrier: …
- insured: …
- employer: …
- adjusterName: …
- adjusterPhone: …
- claimNumber: …
- memberNumber: …
- wcabCaseNumber: …
- authNumber: …
- reviewNumber: …
- referralId: …
- primaryAuthIdentifier: …
- authDateRange: …
- approvedVisits: …
- cptCodes: …
- icd10Codes: …
- bodyRegions: …
- requestedStudy: …
- preAuthorization: applicable=…; status=…; notes=…
- requestorName: …
- responseDeadline: …
- recordsScope: …
- attorneyFirm: …
- courtName: …
- caseNumber: …
- appearanceDate: …
- categoryRationale: …

────────────────────────────────────────
HARD RULES
────────────────────────────────────────
- Work autonomously; one pass; no questions.
- Never invent IDs, dates, NPI, or visits.
- Never swap carrier and insured (CorVel/CareWest = carrier; Oakwood Village-style employers = insured/employer).
- Prefer document content over e-fax header/CSID when they conflict.
- Create a fax_summaries record for every fax, including blank.
- After save, briefly confirm in chat and stop.
