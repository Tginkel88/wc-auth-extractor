# Gravity Rail document processing workflow audit

Radius Physical & Sports Rehab (workspace **Radius PT**) processes inbound
authorizations and referrals through Gravity Rail. This audit covers the
current fax/email document pipeline, what is inefficient about it, and what
to change.

CLI used for this review: `@gravity-rail/cli` **0.22.0** (`gr`).

Live workspace UUID (from Gravity Rail mail to `drtristan@radiusclinic.com`):

`41c74e68-2010-4ee1-88d6-6eb724ac14d3`

App: https://app.gravityrail.com/w/41c74e68-2010-4ee1-88d6-6eb724ac14d3

---

## What this review could and could not pull

| Source | Status |
|--------|--------|
| This repo (`prompt.md`, git history, PR #5 worker prompt) | Pulled |
| Gravity Rail public docs + CLI/SDK surface | Pulled |
| Clinic mail about Documo, Jane, BAA, and live failures | Pulled (no PHI quoted) |
| Live workflows, tasks, abilities, toolkits, Documo status, event-rule execution logs | **Not pulled** |

`gr` requires OAuth (`gr login --env prod`) or `GRAVITY_RAIL_API_KEY`. This
environment has neither. Login is a browser PKCE flow; there is no device-code
path. Exact commands to dump the live graph once a key exists are in
[Pulling the live workflow](#pulling-the-live-workflow-with-gr).

Treat `prompt.md` as the intended agent behavior. The live workflow may have
diverged (spreadsheet name, extra workers, event rules). After login, run
`gr prompts inspect` against the live starting task and diff it against
`prompt.md`.

---

## Current pipeline (as designed)

Two inbound paths already exist in prompts and mail. A third path is native
Gravity Rail fax (T.30 on a Gravity Rail number) and is documented by Gravity
Rail, but Radius has been trialing **Documo** and has not yet ported the
clinic fax number (Alyson: porting the number is the “floodgate”).

```
Documo inbound fax  ──┐
                      │  Chat + PDF attached
Gravity Rail inbox ───┤  (faxes_cs-radius-clinic@gravityrail.net)
  email + PDF         │
                      ▼
            Workflow agent (one pass)
                      │
         1. extract_document_text (OCR)
            mode TEXT | FORMS | TABLES
            writes a new workspace text file
         2. read_file_contents (text file only)
         3. Classify type + extract fields in-context
         4. Create fax_summaries record
         5. Find Google Sheet + append 26-column row
         6. (workers) Email Haley / Ally / Danielle
         7. Chat confirmation
                      │
                      ▼
         Staff paste Jane starred-note block by hand
```

`prompt.md` is still a **single combined agent**. PR #5
(`prompts/new-patient-wc.md`) is a specialist worker for
`type = workers_comp` and `route = work_comp_new`. It is not on `master` and
was not applied to Gravity Rail in that run.

### Document types

`blank` | `workers_comp` | `mva` | `third_party_referral` |
`imaging_referral` | `records_or_subpoena` | `unknown`

### What gets persisted today

`fax_summaries` is a workspace-wide collection. The combined prompt only
requires **type, sender, date, summary**. The worker prompt also stores
`source`, `originator`, `originator_csid`.

All clinical fields (patient, DOI, claim, auth, visits, Jane block) are
flattened into one `summary` textarea, then copied again into Google Sheets
column Y.

---

## Live signals (not from the CLI)

1. **Open Gravity Rail support request** (opened ~2026-08-26, status mail
   again 2026-09-01):
   *`email:send` on Fax Summaries silently skipped for last inbound faxes*
   - Request:
     `https://app.gravityrail.com/w/41c74e68-2010-4ee1-88d6-6eb724ac14d3?openTab=support&supportRequest=b5cdcd04-e11a-4706-8f97-5e807f97f448`
   - Gravity Rail documents that **email notify is off by default** on
     members. If the channel is disabled, delivery is **silently skipped**.
     That matches this ticket. Staff email is the step the front desk
     actually notices; OCR can succeed and Haley still gets nothing.

2. **Documo Intelligent Document Processing is not available** on the current
   Documo plan, and Documo does **not** write inbound faxes into Jane. Gravity
   Rail is doing OCR + extraction instead. Jane still needs a human paste
   of the starred-note block.

3. **Inbound email at Gravity Rail is size-capped** (SES ~10 MB for body +
   attachments). A multi-page scanned packet emailed into
   `faxes_cs-radius-clinic@gravityrail.net` can bounce before the agent runs.
   Documo/native fax does not have that cap.

4. The deprecated Apps Script pipeline (Gmail label → Vertex Gemini → NPI
   sheet → Drive archive → audit sheet → staff email) was removed from git
   in PR #4. Useful pieces that did **not** come across: NPI enrichment,
   confidence-scored JSON fields, Drive archive of the source PDF, and a
   review-needed gate before emailing staff.

---

## Findings (what to change)

### P0 — Staff never get the email even when extraction works

The live ticket is `email:send` silently skipped on Fax Summaries create.

**Do this, in order:**

1. In Members, turn **notify_email on** for Haley, Ally, Danielle (and
   whoever else should get intake mail). Email is off by default.
2. Confirm the event rule target: `data_record:created` on `fax_summaries`,
   action `email:send` or `member:notify`. Check
   `gr events rules executions` for `silently skipped` / missing contact.
3. **Stop asking the agent to send mail.** Agent Gmail/inbox send is extra
   tool rounds and a second failure mode. One event rule on record create
   should fan out to staff. The agent’s job ends when the record is saved.
4. Keep PHI out of the email body. Link to the Gravity Rail record / chat
   (member or record id), same guidance as Gravity Rail’s Member Notify docs.

`prompt.md` still tells the combined agent only to write Sheets, while the
new-patient worker also emails three people. Two different contracts, one of
them already failing in production.

### P0 — OCR mode is wrong for the main document type

`prompt.md` says: prefer **TEXT** unless the page is a labeled intake/referral
form (then FORMS) or a table-heavy panel (then TABLES).

The agent must pick the mode **before it has read the fax**. Following the
written default, almost every run uses TEXT. Workers’ comp authorizations,
MVA auths, and referrals **are** labeled forms. TEXT dumps reading-order
prose and drops key-value alignment that FORMS is built for (carrier vs
insured, auth # vs review #, visit counts).

**Change:**

- Default OCR mode to **FORMS** for this workflow.
- Use TEXT only after a blank/cover-only short-circuit, or when FORMS returns
  garbage.
- Use TABLES only as a second pass on med-list/lab pages, not as the first
  guess.
- Better: a first task that always runs FORMS (no model choice), then a
  classify task that reads the OCR file.

### P0 — One 350-line agent does six jobs

Every fax pays for: OCR tool call → read OCR file → classify → extract ~30
fields → compose a rigid summary + Jane block → create record → find
spreadsheet → optionally read headers → append row → (sometimes) email.

That is 6–10 serial tool rounds in one context window, with a prompt that
also contains a full example and Jane layout rules. Long packets blow
tokens; blank cover sheets still run the whole stack.

Gravity Rail workflows are built for **one job per task**, with Switch Task
and Data Record Created actions between them. PR #5 already sketched
orchestrator → `work_comp_new` worker. Finish that split.

**Target task graph:**

| Task | Job | Tools |
|------|-----|--------|
| 1. Ingest | Detect channel (`documo` vs `email_inbox`), attach file ids, skip blank after page-1 peek | File read (page 1 PNG **or** OCR) |
| 2. OCR | `extract_document_text` FORMS once; save `ocr_text_file_id` | Document extract only |
| 3. Classify + match | Type, pre-auth flag, patient match vs clinic roster | Data Access on patients; no Sheets |
| 4. Route | Switch Task to a specialist (WC new, WC existing, MVA, imaging, records, blank, unknown) | None / Switch Task action |
| 5. Extract | Fill **typed `fax_summaries` fields**, not a prose dump | Data Access create |
| 6. Notify | Event rule, not the agent | `email:send` / Member Notify / in-app |

Blank faxes exit after task 1 or 2 with a tiny record. Specialists never
load Jane rules for a records request.

Pass `ocr_text_file_id` in the handoff (already specified in the new-patient
worker) so workers never re-OCR.

### P1 — Persistence is a blob, so everything downstream is expensive

Today the system of record is a textarea. That forces:

- Google Sheets as a queryable log (26 columns, full summary in Y)
- Staff scanning chat text instead of filtering by claim # / patient
- Jane block regenerated by the LLM instead of a template
- No CEL conditions like `record.data.type == "workers_comp"` on actions

**Change the `fax_summaries` form** to indexed fields, then render summary
and Jane from templates:

| Field slug | Type | Indexed |
|------------|------|---------|
| `type` | dropdown (the enum) | yes |
| `source` | dropdown `documo` / `email_inbox` | yes |
| `originator` | text | |
| `originator_csid` | text | |
| `sender` | text | yes |
| `received_date` | date | yes |
| `patient_name` | text | yes |
| `date_of_birth` | date | yes |
| `date_of_injury` | date | |
| `referring_provider` | text | |
| `npi_number` | text | |
| `carrier` | text | yes |
| `insured` | text | |
| `employer` | text | |
| `adjuster_name` / `adjuster_phone` | text / phone | |
| `claim_number` | text | yes |
| `auth_number` / `review_number` / `referral_id` | text | yes |
| `primary_auth_identifier` | text | yes |
| `pre_auth` | yes/no | yes |
| `approved_visits` | integer | |
| `auth_date_range` | text | |
| `cpt_codes` / `icd10_codes` / `body_regions` | text | |
| `requested_study` | text | |
| `patient_status` | dropdown new / existing / unknown | yes |
| `ocr_text_file_id` | text | |
| `source_file_id` | text | |
| `summary` | long text (generated) | |
| `jane_note` | long text (generated) | |
| `status` | dropdown | yes |

Attach this form on the extract task (Data Collection), with Data Access
create. Gravity Rail will collect fields instead of hoping the model emits a
perfect FAX SUMMARY template.

Google Sheets then becomes optional: export CSV from the form, or a webhook
on `data_record:created`. Do not spend 2–3 tool calls per fax finding a
spreadsheet by name (`REPLACE_WITH_SPREADSHEET_NAME` is still in git).

### P1 — Conflict with how Gravity Rail actually reads faxes

Official inbound-fax docs: the agent should call `read_file` **page by page**
and get a 1600px PNG. That is the context-safe vision path.

This prompt **forbids** `read_file_contents` on the PDF because it “loads
page images and will exhaust context.” That warning is right for *all pages
at once*, wrong for *page 1 only*.

**Hybrid ingest (best of both):**

1. **Page 1 PNG** (`read_file` with `page=1`) for blank/cover detection and
   “is this a form?” Cheap, matches Gravity Rail’s fax design, catches
   garbage OCR before you pay Document AI.
2. **FORMS OCR** for the full packet into a text file (current
   `extract_document_text` path). Keep the “never dump the whole PDF as
   images” rule for pages 2–N.
3. If the PDF already has a text layer (email printouts, digital auths),
   prefer `convertFile(..., 'text')` instead of OCR. The SDK has
   `convertFile` and `convertEmail`; the CLI **has no `gr files convert`**
   (gap in 0.22.0). The agent tool equivalent is still available in-chat.

Do not OCR TIFF and PDF; they are the same transmission.

### P1 — Clinic CSV matching does not belong in the prompt

The new-patient worker assumes an orchestrator already matched the patient
against a “clinic CSV.” File-search over a CSV on every fax is slow and
brittle (name spelling, duplicate DOBs).

**Change:** import the roster into a **Patient** data type (indexed
name + DOB, Jane / EMR id as `externalId`). Orchestrator uses Data Access
search. Longer term, a Jane MCP (`lookup_patient`) replaces the CSV
entirely. Gravity Rail has no native Jane connector; Healthie/FHIR/MCP is
the supported EHR pattern.

Until Jane write-back exists, keep the starred-note block, but **generate it
from fields** (visits, dates, WC|MVA|INS) with a fixed template in the
prompt or a Form Field Update action. Stop spending hundreds of tokens
teaching the model `***` spacing.

### P2 — Dual write and placeholder config

- Spreadsheet name is still `REPLACE_WITH_SPREADSHEET_NAME`. If the live
  workflow copied that string, Sheets append fails every time and the agent
  is told to “note it once and finish.”
- Column Y duplicates the summary already stored on `fax_summaries`.
- Combined prompt and worker prompt disagree on sheet tab (`Work comp` vs
  first sheet / Intake Log).

Pick one log: Gravity Rail form table (preferred) or one named Sheet with
the name committed. Not both, and not a placeholder.

### P2 — Lost capabilities from Apps Script worth restoring selectively

| Old pipeline | Keep? |
|--------------|--------|
| NPI Work Comp sheet lookup | Yes, as Data Access / Sheets **read** after extract, not during OCR |
| Drive archive of source PDF | Yes: Documo already lands files in a folder; confirm
  `inboxFolderId` and do not duplicate blindly |
| Review-needed gate before staff email | Yes: CEL on low confidence / missing claim # / pre-auth |
| Vertex `gemini-2.5-flash` | No; Gravity Rail hosts the model |
| Gmail `WC-Auths` labels | Replace with Gravity Rail chat labels / form `type` |

### P2 — No qualifications on this workflow

`gr qualifications` can bind scenarios and test-chat runs to a workflow
revision. There are no fixtures in this repo. Add 6 canned PDFs (WC auth,
WC pre-auth, blank, imaging, records, emailed-PDF-that-looks-like-fax) and
assert type + primary auth id. That is cheaper than discovering routing
bugs after the clinic number is ported.

### P2 — CLI / ops gaps

- `gr files` cannot convert; SDK `convertFile` / `convertEmail` can.
- Default `gr --env` in `--help` is `dev`; `gr get-started --format llm`
  says prod. Always pass `--env prod` for Radius.
- `gr documo-fax status|faxes` and `gr events rules executions` are the
  right ops views once authenticated. Fax log can contain PHI (sender
  number); page it, do not dump `--all` (the CLI refuses `--all` on
  purpose).

---

## Recommended sequence of changes

Do not rebuild Jane integration first. Fix notify + OCR + record shape, then
split tasks, then optional Sheets.

1. **This week (no prompt rewrite required)**
   - Enable `notify_email` on intake staff.
   - Inspect the Fax Summaries `email:send` rule and recent executions.
   - Confirm Documo `isReady`, `inboxFolderId`, `defaultWorkflowId`.
   - Put the real spreadsheet name in the live prompt if Sheets stays.

2. **Next workflow revision**
   - Default OCR to FORMS; pass `ocr_text_file_id` downstream.
   - Expand `fax_summaries` fields; attach the form to the extract task.
   - Move email/Sheets off the agent onto `data_record:created` actions.
   - Page-1 blank short-circuit.

3. **Split the graph**
   - Orchestrator (ingest + classify + patient match) + specialist workers.
   - Land PR #5 new-patient worker against `route = work_comp_new`.
   - Add existing-patient WC, MVA, imaging, records workers as thin prompts.

4. **After the fax number is ported**
   - Qualifications on real traffic samples (de-identified).
   - Jane lookup MCP if inbound volume justifies it.
   - Drop Google Sheets if the form table is enough for Danielle/Natalie.

---

## Pulling the live workflow with `gr`

```bash
npm install -g @gravity-rail/cli   # 0.22.0 at time of audit
export PATH="$HOME/.npm-global/bin:$PATH"

gr login --env prod                # browser OAuth, or:
# export GRAVITY_RAIL_API_KEY=...  # from workspace Settings → API keys

WID=41c74e68-2010-4ee1-88d6-6eb724ac14d3

gr whoami --env prod
gr workspaces list --env prod -o json

# Graph
gr workflows list -w $WID --env prod -o json
gr workflows diagram -w $WID --env prod --id <workflow_id> -o json
gr tasks list -w $WID --env prod -o json
gr prompts inspect -w $WID --env prod --task-id <starting_task_id>

# Tools the agent actually has
gr toolkits list -w $WID --env prod -o json
gr abilities configured -w $WID --env prod --workflow-id <id> -o json

# Records + automations
gr data-types get-by-slug -w $WID --env prod --slug fax_summaries -o json
gr events rules list -w $WID --env prod -o json
gr events rules executions -w $WID --env prod --rule-id <email_send_rule_id> -o json

# Inbound fax plumbing
gr documo-fax status -w $WID --env prod -o json
gr inboxes list -w $WID --env prod -o json
gr phone-numbers list -w $WID --env prod -o json

# Support ticket on silent email skip
gr support get --env prod --id b5cdcd04-e11a-4706-8f97-5e807f97f448 -o json

# Config lint Gravity Rail already ships
gr concierge chat --env prod -w $WID -m "Run validate_workspace_config and report silent-breakage issues for the fax intake workflow"
```

PHI: do not commit `gr documo-fax faxes` or `gr data-types records list`
output. Those include sender numbers and patient names.

A wrapper that runs the non-PHI commands is in
[`scripts/pull-live-workflow.sh`](../scripts/pull-live-workflow.sh).

---

## CLI surface that matters for this workflow

| Command | Why it matters |
|---------|----------------|
| `gr documo-fax configure --processing-instructions` | First user message on each received fax; keep it one line (“OCR with FORMS, then follow the workflow”). Do not paste `prompt.md` here. |
| `gr workflows tools set` | Attach `builtin:` / `mcp:` tools without duplicating the toolkits ability |
| `gr events rules create-data-record-rule` | Fax Summaries → email/notify without the agent |
| `gr files folders create` then Documo `--inbox-folder-id` | Landing folder must exist first (id, not path) |
| `gr qualifications runs start` | Regression on sample faxes |
| `gr prompts inspect` | See composed layers (workflow + task + form prompts) |

---

## Out of scope / not claimed

- Exact live workflow id, task ids, or whether FORMS is already enabled in
  production (needs `gr` auth).
- Changing Gravity Rail from this PR. This document is the audit only.
- Jane API write-back (no connector in Gravity Rail’s app directory as of
  this CLI version).
