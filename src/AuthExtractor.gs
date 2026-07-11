/** @param {GoogleAppsScript.Base.Blob} pdfBlob @returns {Object} AuthRecord — Slice 3 */
var AuthExtractor = (function () {
  /**
   * Built at call time (not module load) so AuthRecordFields is available regardless
   * of Apps Script file evaluation order.
   * @returns {string[]}
   */
  function schemaFields_() {
    return AuthRecordFields.FIELD_KEYS.filter(function (key) {
      return AuthRecordFields.LOOKUP_ONLY_FIELDS.indexOf(key) === -1;
    });
  }

  /**
   * @param {GoogleAppsScript.Base.Blob} pdfBlob
   * @returns {Object}
   */
  function extract(pdfBlob) {
    var rawText = callVertex_(pdfBlob);
    var record = ResponseParser.parse(rawText);
    if (record.parseError) {
      record.extractionError = record.parseError;
    }
    return record;
  }

  function buildExtractionPrompt_() {
    var hints = Config.extractionHints || {};
    var insuredExamples = (hints.insuredExamples || []).join(', ') || 'Oakwood Village';
    var carrierExamples = (hints.carrierExamples || []).join(', ') || 'Corvell, Carewest';

    var schemaLines = schemaFields_().map(function (field) {
      return '  "' + field + '": { "value": "", "confidence": "missing" }';
    }).join(',\n');

    return (
      'You are extracting structured data from a California medical authorization, referral, or imaging approval fax/scan.\n' +
      'Documents may be work-comp authorizations, motor vehicle accident (MVA) authorizations, or third-party private insurance / imaging referrals.\n' +
      'Read every page of the PDF carefully. Return ONLY valid JSON matching the schema below.\n' +
      'For each field provide "value" and "confidence" where confidence is one of: high, medium, low, missing.\n' +
      'Use missing confidence when the field is not present or unreadable. Do not guess claim numbers or auth numbers.\n' +
      'Dates should be MM/DD/YYYY when possible. Lists (CPT, ICD-10, body regions) should be comma-separated strings in value.\n' +
      'If multiple pages exist, combine information across all pages.\n\n' +
      'FIRST classify "authType.value" as exactly one of these keys:\n' +
      '- "work_comp": Workers compensation authorization (WC carrier/TPA, claim number, employer/insured, WCAB references).\n' +
      '- "mva": Motor vehicle accident / auto liability authorization (auto insurer, MVA/accident claim language).\n' +
      '- "private_imaging": Third-party private/commercial insurance referral, especially imaging (MRI/CT/X-ray) referrals or prior auth.\n' +
      '- "unknown": Only if the document type cannot be determined.\n' +
      'Set authType.confidence to high/medium when clear cues exist; low/missing when unsure.\n\n' +
      'IMPORTANT — carrier vs insured (do not swap these):\n' +
      '- "carrier": The insurer, TPA, claims administrator, or auto carrier that issued/administers the auth or referral.\n' +
      '  WC examples: ' +
      carrierExamples +
      '. Also look for private health plans or auto insurers. Labels: Carrier, Insurer, TPA, Claims Administrator, Payer.\n' +
      '- "insured": The named insured / policyholder when present (employer for WC; person or org for private/MVA).\n' +
      '  WC examples: ' +
      insuredExamples +
      '. Labels: Insured, Named Insured, Policyholder.\n' +
      '- "employer": Injured worker employer when labeled separately (mainly WC); often matches insured.\n' +
      '- NEVER put ' +
      insuredExamples +
      ' (or similar employer/insured names) in "carrier".\n' +
      '- NEVER put ' +
      carrierExamples +
      ' (or similar carrier/TPA names) in "insured".\n\n' +
      'Adjuster (extract when present on the document):\n' +
      '- "adjusterName": Claims adjuster or case manager name.\n' +
      '- "adjusterPhone": Adjuster phone, direct line, or fax number as shown.\n\n' +
      'Authorization number (map any of these labels into "authNumber"):\n' +
      '- Authorization Number, Auth Number, Auth #, Authorization #\n' +
      '- Review Number, Review #, Review No.\n' +
      '- Referral ID, Referral Id, Referral Number, Referral #\n' +
      '- Prefer the value labeled as authorization/review/referral ID over unrelated reference numbers.\n' +
      '- If more than one of these labels appears with the same value, use that value once.\n\n' +
      'Type-specific notes:\n' +
      '- work_comp: prioritize claim #, employer/insured, WCAB/case # when present.\n' +
      '- mva: prioritize claim # / accident claim references and auto carrier.\n' +
      '- private_imaging: prioritize member/subscriber #, referral ID, imaging CPT codes; approved visits may be missing.\n\n' +
      'Schema:\n' +
      '{\n' +
      schemaLines +
      '\n' +
      '}'
    );
  }

  /** @param {GoogleAppsScript.Base.Blob} pdfBlob @returns {string} */
  function callVertex_(pdfBlob) {
    var url =
      'https://' +
      Config.vertexLocation +
      '-aiplatform.googleapis.com/v1/projects/' +
      Config.vertexProjectId +
      '/locations/' +
      Config.vertexLocation +
      '/publishers/google/models/' +
      Config.vertexModel +
      ':generateContent';

    var payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: Utilities.base64Encode(pdfBlob.getBytes())
              }
            },
            { text: buildExtractionPrompt_() }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var status = response.getResponseCode();
    var body = response.getContentText();
    if (status < 200 || status >= 300) {
      throw new Error('Vertex AI request failed (' + status + '): ' + body.slice(0, 500));
    }

    return extractModelText_(body);
  }

  /** @param {string} responseBody */
  function extractModelText_(responseBody) {
    var parsed = JSON.parse(responseBody);
    var candidates = parsed.candidates || [];
    if (candidates.length === 0) {
      throw new Error('Vertex AI returned no candidates');
    }

    var parts = (((candidates[0] || {}).content || {}).parts) || [];
    var textParts = [];
    parts.forEach(function (part) {
      if (part.text) {
        textParts.push(part.text);
      }
    });

    if (textParts.length === 0) {
      throw new Error('Vertex AI response contained no text parts');
    }

    return textParts.join('\n');
  }

  return { extract: extract };
})();
