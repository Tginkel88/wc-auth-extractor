# Implementation Guide: v2 Update to the Live Apps Script Project

This is the step-by-step companion to [PRD v2](./PRD-v2.md#existing-deployment--incremental-update-strategy-v2-planning). It assumes you already have a working v1 project deployed and are adding the v2 capabilities (NPI lookup, date of injury, auth-number aliases, pre-authorization, multi-category classification, records/subpoena handling) on top of it.

The code snippets below are **starting points to adapt**, not a drop-in replacement — I don't have access to your live script (this repo is documentation-only), so exact variable/function names in your project may differ. Where a snippet references something specific to your code, a comment calls that out.

---

## Phase 0 — Safety net before touching anything

1. **Duplicate or version the live project** before making changes, since this tool is running in production:
   - In the Apps Script editor: **File → Make a copy**, or
   - If you use `clasp`: `clasp clone <scriptId>` locally, commit the pulled source to a `src/` folder in this repo (or a private one) so you have a diffable history, then `clasp push` when ready to deploy changes.
2. **Note your current triggers** (Extensions → Apps Script → Triggers) so you can recreate the 10-minute trigger if you accidentally delete it while editing.
3. **Confirm you can find these three things in your project** — you'll need them in Phase 1:
   - The Gemini extraction call (likely a function using `UrlFetchApp` against the Vertex AI endpoint).
   - Wherever the JSON schema or prompt text listing extracted fields lives (this may be inline in a `.gs` file, or a separate JSON file in the project — this is your "apps.json").
   - The audit-log Sheet and its current column headers.

---

## Phase 1 — Answer the self-check questions (10 minutes, no code changes)

Open your project and answer these three questions. They determine how much of the rest of this guide is config-only vs. requires new functions.

1. **Does your Gemini call pass a structured `responseSchema`** (a JSON Schema object in `generationConfig.responseSchema`) that lists the fields to extract? Or is it a free-text prompt asking Gemini to "return JSON with these fields: ..."?
   - If structured schema in a separate JSON file → adding new scalar fields is genuinely config-only (Phase 2 is just an edit).
   - If free-text prompt or inline schema in a `.gs` file → you'll edit that prompt/object directly (still simple, just not a separate config file).
2. **Does `ResponseParser` (or wherever you turn the raw Gemini JSON into your internal record) pass through whatever the schema returns, or does it explicitly list/type each field** (e.g. `record.claimNumber = json.claimNumber`)?
   - Explicit listing → you'll add one line per new field (Phase 3).
3. **Does your email-building code loop over a field list/config, or does it have hardcoded HTML per field** (e.g. a template literal with `Claim #: ${record.claimNumber}` repeated for each field)?
   - Hardcoded → budget real template-editing time for Phase 6, not just config changes.

Keep your answers handy; they're referenced by phase below.

---

## Phase 2 — Add the new extraction fields to the schema/prompt

**Goal:** Gemini starts returning `dateOfInjury`, `reviewNumber`, `referralId`, `category`, `categoryConfidence`, and a `preAuthorization` object, in addition to everything it already returns.

If you use a structured `responseSchema`, add these properties (adjust names to match your existing camelCase/snake_case convention):

```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "enum": ["wc_authorization", "mva", "third_party_referral", "records_or_subpoena", "unknown"]
    },
    "categoryConfidence": { "type": "number" },
    "categoryRationale": { "type": "string" },

    "patientName": { "type": "string" },
    "dateOfBirth": { "type": "string" },
    "dateOfInjury": { "type": "string" },
    "referringProvider": { "type": "string" },

    "claimNumber": { "type": "string" },
    "authorizationNumber": { "type": "string" },
    "reviewNumber": { "type": "string" },
    "referralId": { "type": "string" },

    "preAuthorization": {
      "type": "object",
      "properties": {
        "applicable": { "type": "boolean" },
        "status": { "type": "string" },
        "notes": { "type": "string" },
        "confidence": { "type": "number" }
      }
    },

    "requestorName": { "type": "string" },
    "responseDeadline": { "type": "string" },
    "recordsScope": { "type": "string" },
    "requestedStudy": { "type": "string" }
  },
  "required": ["category", "categoryConfidence", "patientName"]
}
```

Keep all your existing v1 properties (`insurer`, `employer`, `wcabCaseNumber`, `cptCodes`, `icd10Codes`, `bodyRegions`, `approvedVisits`, `authorizationDateRange`, `fieldConfidence`, etc.) — this is additive.

If you use a free-text prompt instead, add sentences like:

> Also extract: the date of injury (look for "DOI", "date of injury", "injury date"). The authorization identifier may be labeled "authorization number," "review number," or "referral ID" — extract whichever is present under the key that matches its label (`authorizationNumber`, `reviewNumber`, `referralId`) and populate whichever are present. If the document indicates pre-authorization is required or pending, return a `preAuthorization` object with `applicable: true`, its `status`, and any `notes`. Classify the overall document type as one of: `wc_authorization`, `mva`, `third_party_referral`, `records_or_subpoena`, or `unknown`, with a `categoryConfidence` between 0 and 1 and a one-sentence `categoryRationale`.

**Test checkpoint:** run the extraction function manually (or via the Apps Script editor's "Run" button with a test PDF) against 2–3 real sample documents you already have and confirm the new fields come back in the raw JSON before wiring anything else. This isolates schema/prompt issues from parser issues.

---

## Phase 3 — Update the parser: new fields + primary-auth-identifier derivation

Wherever you convert raw Gemini JSON into your internal record object, add handling for the new fields and a small derivation function for the "primary" auth identifier (this logic doesn't exist yet in v1 — it's genuinely new, even if small):

```javascript
// ResponseParser.gs (or wherever raw JSON becomes your typed record)

const AUTH_ID_PRIORITY = ['authorizationNumber', 'reviewNumber', 'referralId'];

function derivePrimaryAuthIdentifier(record) {
  for (const key of AUTH_ID_PRIORITY) {
    if (record[key]) {
      return { value: record[key], source: key };
    }
  }
  return { value: null, source: null };
}

function parsePreAuthorization(raw) {
  const pa = (raw && raw.preAuthorization) || {};
  return {
    applicable: !!pa.applicable,
    status: pa.status || null,
    notes: pa.notes || null,
    confidence: typeof pa.confidence === 'number' ? pa.confidence : null,
  };
}

function parse(rawJson) {
  const record = {
    // ...your existing v1 field assignments stay as-is...

    dateOfInjury: rawJson.dateOfInjury || null,
    authorizationNumber: rawJson.authorizationNumber || null,
    reviewNumber: rawJson.reviewNumber || null,
    referralId: rawJson.referralId || null,
    preAuthorization: parsePreAuthorization(rawJson),

    requestorName: rawJson.requestorName || null,
    responseDeadline: rawJson.responseDeadline || null,
    recordsScope: rawJson.recordsScope || null,
    requestedStudy: rawJson.requestedStudy || null,
  };

  record.primaryAuthIdentifier = derivePrimaryAuthIdentifier(record);

  return record;
}

function parseClassification(rawJson) {
  return {
    category: rawJson.category || 'unknown',
    confidence: typeof rawJson.categoryConfidence === 'number' ? rawJson.categoryConfidence : 0,
    rationale: rawJson.categoryRationale || null,
  };
}
```

**Test checkpoint:** unit-test `parse()` and `parseClassification()` against a few hand-written JSON fixtures (a complete one, one missing `preAuthorization` entirely, one with only `referralId` and no `authorizationNumber`) and assert the output shape — this is exactly the kind of pure-function test the PRD's Testing Decisions section calls for.

---

## Phase 4 — Build the NPI lookup module (new code)

This is the one piece that's unambiguously new logic, regardless of how your existing code is structured — v1 never talked to a second spreadsheet. Add a new file, e.g. `NpiLookup.gs`:

```javascript
// NpiLookup.gs
// Read-only lookup of a referring provider's NPI number from the
// company's existing work-comp provider spreadsheet.

const NpiLookup = (function () {
  const PROP_KEYS = {
    SHEET_ID: 'NPI_SHEET_ID',
    TAB_NAME: 'NPI_TAB_NAME',
    NAME_COLUMNS: 'NPI_NAME_COLUMNS', // comma-separated header names or column letters, e.g. "Provider Name"
    NPI_COLUMN: 'NPI_NUMBER_COLUMN',  // header name or column letter, e.g. "NPI"
  };

  let _cache = null;

  function normalizeName(raw) {
    if (!raw) return '';
    return raw
      .toUpperCase()
      .replace(/\b(MD|DO|PT|DC|NP|PA)\b\.?/g, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function reorderIfLastFirst(name) {
    if (name.includes(',')) {
      const [last, first] = name.split(',').map(s => s.trim());
      return normalizeName(`${first} ${last}`);
    }
    return name;
  }

  function headerOrLetterToIndex(spec, headers) {
    const idx = headers.findIndex(h => String(h).trim().toLowerCase() === spec.trim().toLowerCase());
    if (idx >= 0) return idx;
    if (/^[A-Z]+$/i.test(spec)) {
      return spec.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    }
    throw new Error(`NpiLookup: could not resolve column "${spec}" — check NPI_* Script Properties.`);
  }

  function loadRows() {
    if (_cache) return _cache;

    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty(PROP_KEYS.SHEET_ID);
    const tabName = props.getProperty(PROP_KEYS.TAB_NAME);
    const nameCols = (props.getProperty(PROP_KEYS.NAME_COLUMNS) || '').split(',').map(s => s.trim()).filter(Boolean);
    const npiCol = props.getProperty(PROP_KEYS.NPI_COLUMN);

    if (!sheetId || !tabName || !npiCol || nameCols.length === 0) {
      throw new Error('NpiLookup: missing Script Properties (NPI_SHEET_ID / NPI_TAB_NAME / NPI_NAME_COLUMNS / NPI_NUMBER_COLUMN).');
    }

    const values = SpreadsheetApp.openById(sheetId).getSheetByName(tabName).getDataRange().getValues();
    const headers = values[0];
    const nameIdxs = nameCols.map(c => headerOrLetterToIndex(c, headers));
    const npiIdx = headerOrLetterToIndex(npiCol, headers);

    const rows = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rawName = nameIdxs.map(idx => row[idx]).filter(Boolean).join(' ');
      const npi = String(row[npiIdx] || '').trim();
      if (!rawName || !npi) continue;
      const normalized = normalizeName(rawName);
      rows.push({ rawName, npi, normalized, reordered: reorderIfLastFirst(normalized) });
    }

    _cache = rows;
    return _cache;
  }

  function isValidNpiFormat(npi) {
    return /^\d{10}$/.test(npi);
  }

  function buildMatch(row, confidence) {
    const formatOk = isValidNpiFormat(row.npi);
    return {
      status: 'matched',
      npiNumber: row.npi,
      matchedName: row.rawName,
      confidence,
      formatWarning: formatOk ? null : 'NPI value is not 10 digits — verify against the spreadsheet, this may be a data entry error.',
    };
  }

  function lookupByProviderName(providerName) {
    if (!providerName) return { status: 'not_found', confidence: 0 };

    const rows = loadRows();
    const target = normalizeName(providerName);
    const targetReordered = reorderIfLastFirst(target);

    const exact = rows.filter(r => r.normalized === target || r.reordered === targetReordered);
    if (exact.length === 1) return buildMatch(exact[0], 1.0);
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        candidates: exact.map(r => ({ matchedName: r.rawName, npiNumber: r.npi })),
        confidence: 0.5,
      };
    }

    const targetTokens = new Set(target.split(' '));
    const scored = rows
      .map(row => {
        const rowTokens = new Set(row.normalized.split(' '));
        const overlap = [...targetTokens].filter(t => rowTokens.has(t)).length;
        return { row, score: overlap / Math.max(targetTokens.size, rowTokens.size, 1) };
      })
      .filter(s => s.score >= 0.6)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return { status: 'not_found', confidence: 0 };
    if (scored.length === 1 || (scored[0].score - (scored[1] ? scored[1].score : 0)) > 0.25) {
      return buildMatch(scored[0].row, scored[0].score);
    }
    return {
      status: 'ambiguous',
      candidates: scored.slice(0, 5).map(s => ({ matchedName: s.row.rawName, npiNumber: s.row.npi })),
      confidence: scored[0].score,
    };
  }

  function clearCache() {
    _cache = null;
  }

  return { lookupByProviderName, clearCache };
})();
```

Then set the four Script Properties it needs (**Project Settings → Script Properties** in the Apps Script editor, or via `PropertiesService.getScriptProperties().setProperties({...})` run once):

| Key | Example value |
|---|---|
| `NPI_SHEET_ID` | the work-comp provider spreadsheet's ID (from its URL) |
| `NPI_TAB_NAME` | e.g. `Providers` |
| `NPI_NAME_COLUMNS` | e.g. `Provider Name` (or `B` if you prefer column letters) |
| `NPI_NUMBER_COLUMN` | e.g. `NPI` (or `D`) |

**Test checkpoint:** with real (or de-identified test) rows in the sheet, call `NpiLookup.lookupByProviderName('Smith, John')` from the Apps Script editor's console for a name you know is in the sheet in a different format (e.g. sheet has "John Smith, MD"), and confirm it returns `status: 'matched'`. Also test a name that doesn't exist (expect `not_found`) and, if you have two similarly-named providers, confirm `ambiguous` triggers correctly.

---

## Phase 5 — Wire classification + NPI lookup + review logic into the review/decision step

Wherever your `ReviewPolicy`-equivalent logic decides "does this need a manual-review banner," add the classification-confidence bands and call `NpiLookup` conditionally by category:

```javascript
const CLASSIFIED_THRESHOLD = 0.80;
const LOW_CONFIDENCE_THRESHOLD = 0.50;

function evaluateClassification(classification) {
  if (classification.confidence >= CLASSIFIED_THRESHOLD) {
    return { triageNeeded: false, banner: null };
  }
  if (classification.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return { triageNeeded: false, banner: 'LOW_CONFIDENCE_CATEGORY' };
  }
  return { triageNeeded: true, banner: 'NEEDS_MANUAL_TRIAGE' };
}

function shouldLookupNpi(category) {
  const configured = PropertiesService.getScriptProperties().getProperty('NPI_LOOKUP_CATEGORIES');
  const categories = (configured || 'wc_authorization').split(',').map(s => s.trim());
  return categories.includes(category);
}
```

Set `NPI_LOOKUP_CATEGORIES` as a Script Property too (default `wc_authorization`; add `,mva` or `,third_party_referral` once you've validated it's useful for those categories in shadow mode).

Your existing field-level `reviewNeeded`/`flaggedFields` logic (missing claim #, low-confidence fields, etc.) stays exactly as it is — this is a second, independent check layered on top, not a replacement.

---

## Phase 6 — Category-aware email subject and body sections

This is the phase most affected by your Phase-1 answer to question 3. Add (or adapt) these pieces in your email-composing code:

```javascript
const CATEGORY_LABELS = {
  wc_authorization: (record) => (record.preAuthorization.applicable ? 'WC Pre-Auth' : 'WC Auth'),
  mva: () => 'MVA',
  third_party_referral: () => 'Imaging Referral',
  records_or_subpoena: () => 'Records/Subpoena',
  unknown: () => 'Needs Triage',
};

const AUTH_ID_LABELS = {
  authorizationNumber: 'Auth',
  reviewNumber: 'Review',
  referralId: 'Referral',
};

function buildSubject(record, classification) {
  const labelFn = CATEGORY_LABELS[classification.category] || CATEGORY_LABELS.unknown;
  const label = labelFn(record);
  const idPart = record.primaryAuthIdentifier.value
    ? ` — ${AUTH_ID_LABELS[record.primaryAuthIdentifier.source] || 'ID'} ${record.primaryAuthIdentifier.value}`
    : '';
  return `[${label}] ${record.patientName || 'Unknown Patient'}${idPart}`;
}

function buildNpiSectionHtml(npi) {
  if (!npi) return '';
  if (npi.status === 'matched') {
    const warn = npi.formatWarning ? ` ⚠️ ${npi.formatWarning}` : '';
    return `<p><strong>NPI:</strong> ${npi.npiNumber} (matched: ${npi.matchedName})${warn}</p>`;
  }
  if (npi.status === 'ambiguous') {
    const list = npi.candidates.map(c => `${c.matchedName} — ${c.npiNumber}`).join('<br>');
    return `<p>⚠️ <strong>NPI MATCH AMBIGUOUS</strong><br>${list}</p>`;
  }
  return `<p><strong>NPI:</strong> not found in spreadsheet</p>`;
}

function buildPreAuthSectionHtml(preAuth) {
  if (!preAuth || !preAuth.applicable) return '';
  const lowConf = preAuth.confidence !== null && preAuth.confidence < LOW_CONFIDENCE_THRESHOLD ? ' ⚠️ low confidence' : '';
  return `<div class="pre-auth"><strong>Pre-Authorization:</strong> ${preAuth.status || 'status unspecified'}${lowConf}${preAuth.notes ? `<br>${preAuth.notes}` : ''}</div>`;
}

function buildAuthAliasSectionHtml(record) {
  const rows = ['authorizationNumber', 'reviewNumber', 'referralId']
    .filter(k => record[k])
    .map(k => `${AUTH_ID_LABELS[k]}: ${record[k]}${record.primaryAuthIdentifier.source === k ? ' (primary)' : ''}`);
  if (rows.length === 0) return '';
  return `<p>${rows.join('<br>')}</p>`;
}

function buildRecordsSubpoenaBannerHtml(category) {
  if (category !== 'records_or_subpoena') return '';
  return `<div class="banner-warning"><strong>This is NOT an authorization</strong> — route to records/subpoena handling.</div>`;
}

function buildTriageBannerHtml(reviewResult) {
  if (reviewResult.banner === 'NEEDS_MANUAL_TRIAGE') {
    return `<div class="banner-warning"><strong>⚠️ NEEDS MANUAL TRIAGE</strong> — document category could not be confidently determined.</div>`;
  }
  if (reviewResult.banner === 'LOW_CONFIDENCE_CATEGORY') {
    return `<div class="banner-caution"><strong>⚠️ LOW CONFIDENCE CATEGORY — VERIFY TRIAGE</strong></div>`;
  }
  return '';
}
```

Assemble these into your existing email body template alongside the v1 field list and the ▶ Drive link (which stays exactly as it was).

**Test checkpoint:** compose a test email for a fixture record with `preAuthorization.applicable = true` and an ambiguous NPI match, and visually confirm both banners render — this is the exact scenario the PRD's `EmailComposer` test cases describe.

---

## Phase 7 — Category-based Gmail label routing

If your current code does one fixed label swap (`WC-Auths` → `WC-Processed`), change it to pick a label based on category:

```javascript
const PROCESSED_LABELS = {
  wc_authorization: 'Intake-Processed/WC-Auth',
  mva: 'Intake-Processed/MVA',
  third_party_referral: 'Intake-Processed/Third-Party-Referral',
  records_or_subpoena: 'Intake-Processed/Records-Subpoena',
  unknown: 'Intake-Processed/Needs-Triage',
};

function markProcessed(message, category) {
  const labelName = PROCESSED_LABELS[category] || PROCESSED_LABELS.unknown;
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);
  message.getThread().addLabel(label);
  message.getThread().removeLabel(GmailApp.getUserLabelByName('Intake-Pending')); // or your existing intake label
}
```

**Before this step, set up the labels in Gmail** (Settings → Labels, or they'll auto-create via `GmailApp.createLabel` the first time the script runs) and confirm your Gmail filter routes the broader mail types (MVA, third-party/imaging, records/subpoena) into your intake label, not just the original WC-auth-tuned filter. This is a manual Gmail-filter edit, not code — see the PRD's "owner truth-check #2."

---

## Phase 8 — Extend the audit log

Add columns to your Sheet header row (in whatever order makes sense next to your existing ones), then update the append call:

```javascript
function log(record, classification, review, recipients) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit Log'); // adjust to your sheet/tab name
  sheet.appendRow([
    new Date(),
    classification.category,
    classification.confidence,
    record.patientName,
    record.dateOfInjury || '',
    record.claimNumber || '',
    record.primaryAuthIdentifier.value || '',
    record.authorizationNumber || '',
    record.reviewNumber || '',
    record.referralId || '',
    record.approvedVisits || '',
    record.preAuthorization.applicable,
    record.npi ? record.npi.status : '',
    record.npi && record.npi.npiNumber ? record.npi.npiNumber : '',
    recipients.join(', '),
    review.reviewNeeded,
    review.triageNeeded,
    record.sourceDriveUrl,
  ]);
}
```

Add the corresponding header labels to row 1 of the sheet before running this in production, so the columns line up.

---

## Phase 9 — Orchestrator: wire it all together

Pull the pieces above into your existing `run()` (or equivalent) function:

```javascript
function run() {
  const messages = IntakeReader.fetchPending(); // your existing label-scanning logic
  messages.forEach(message => {
    const pdfBlob = archiveAndGetBlob(message); // your existing Drive-archiving step

    const rawJson = DocumentExtractor.extract(pdfBlob); // your existing Gemini call, now returning the expanded schema
    const classification = parseClassification(rawJson);
    const record = parse(rawJson);

    if (shouldLookupNpi(classification.category)) {
      record.npi = NpiLookup.lookupByProviderName(record.referringProvider);
    }

    const fieldReview = ReviewPolicy.evaluate(record); // your existing v1 logic, unchanged
    const classificationReview = evaluateClassification(classification);
    const review = {
      reviewNeeded: fieldReview.reviewNeeded,
      flaggedFields: fieldReview.flaggedFields,
      triageNeeded: classificationReview.triageNeeded,
      banner: classificationReview.banner,
    };

    const email = EmailComposer.compose(record, classification, review, record.sourceDriveUrl);
    sendEmail(email, recipientsFor(classification.category)); // your existing send logic + category recipient map

    AuditLogger.log(record, classification, review, recipientsFor(classification.category));
    IntakeReader.markProcessed(message, classification.category); // updated per Phase 7
  });
}
```

---

## Phase 10 — Targeted shadow-mode validation

Rather than re-running a full shadow period (your real recipients already trust v1's WC-auth output):

1. Temporarily set the recipient map (Script Property or hardcoded map) so that:
   - `mva`, `third_party_referral`, `records_or_subpoena`, and `unknown` all route to you only.
   - `wc_authorization` continues to real recipients **unless** `preAuthorization.applicable` is true or an NPI lookup ran — route those two cases to you only as well, since they're new behavior on top of an otherwise-proven category.
2. Let it run against real incoming mail for a period you're comfortable with, watching for: correct category assignment, DOI/review#/referralId extraction accuracy, NPI match correctness (including ambiguous cases), and pre-authorization detection accuracy.
3. Adjust the Gemini prompt/schema, classification thresholds, or NPI normalization logic based on what you see.
4. Once satisfied, flip the shadow-routed categories over to real recipients one at a time (e.g. MVA first, then imaging referrals, then records/subpoena) rather than all at once.

---

## Phase 11 — Cleanup

- Update `docs/PRD-v2.md`'s Status line once deployed (change "in progress" language to "deployed").
- If you moved any previously-hardcoded values into Script Properties/`apps.json` along the way, note the final key names in the PRD's Configuration table so they match reality for the next person (or agent) touching this project.
- Consider committing your actual `.gs`/config source into this repo (via `clasp pull`) now that it reflects v2, so future planning doesn't have to work from PRD text alone.

---

## Quick reference: phase → PRD section

| Phase | PRD v2 section |
|---|---|
| 2–3 | Extraction field set (v2), Authorization identifier aliases, Pre-authorization section |
| 4 | Work-comp provider spreadsheet integration → NPI lookup |
| 5 | Classification (new), Two distinct confidence concepts |
| 6 | Output / email |
| 7 | Intake & triggering |
| 8 | Audit log (extended) |
| 9 | Module breakdown (v2) |
| 10 | Rollout |
