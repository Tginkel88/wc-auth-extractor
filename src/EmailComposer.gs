/** @param {Object} authRecord @param {string} sourceUrl @returns {{subject: string, html: string}} — Slice 4 */
var EmailComposer = (function () {
  /**
   * @param {Object} authRecord
   * @param {string} sourceUrl
   * @param {{reviewNeeded: boolean, flaggedFields: string[]}} [review]
   * @returns {{subject: string, html: string}}
   */
  function compose(authRecord, sourceUrl, review) {
    var reviewResult = review || ReviewPolicy.evaluate(authRecord);
    var flaggedSet = {};
    reviewResult.flaggedFields.forEach(function (key) {
      flaggedSet[key] = true;
    });

    var typeInfo = AuthRecordFields.getAuthTypeInfo(authRecord);
    var subject = buildSubject_(authRecord, typeInfo);
    var html =
      buildTypeBadge_(typeInfo) +
      buildBanner_(reviewResult, authRecord) +
      buildIntro_(typeInfo) +
      buildNpiNote_(authRecord) +
      buildFieldTable_(authRecord, flaggedSet) +
      buildSourceLink_(sourceUrl) +
      buildFooter_();

    return { subject: subject, html: html };
  }

  /** @param {Object} authRecord @param {{subjectPrefix: string}} typeInfo */
  function buildSubject_(authRecord, typeInfo) {
    var patient = authRecord.patientName || 'Unknown Patient';
    var authNumber = authRecord.authNumber || 'unknown';
    return typeInfo.subjectPrefix + ': ' + patient + ' — Auth #' + authNumber;
  }

  /** @param {{label: string, key: string}} typeInfo */
  function buildTypeBadge_(typeInfo) {
    var colors = {
      work_comp: { bg: '#e8f0fe', border: '#1a73e8', text: '#174ea6' },
      mva: { bg: '#fce8e6', border: '#d93025', text: '#a50e0e' },
      private_imaging: { bg: '#e6f4ea', border: '#1e8e3e', text: '#0d652d' },
      unknown: { bg: '#f1f3f4', border: '#80868b', text: '#3c4043' }
    };
    var palette = colors[typeInfo.key] || colors.unknown;

    return (
      '<div style="background:' +
      palette.bg +
      ';border:1px solid ' +
      palette.border +
      ';border-radius:4px;' +
      'padding:10px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:' +
      palette.text +
      ';">' +
      '<strong>Type:</strong> ' +
      escapeHtml_(typeInfo.label) +
      '</div>'
    );
  }

  /** @param {{reviewNeeded: boolean}} review @param {Object} authRecord */
  function buildBanner_(review, authRecord) {
    if (!review.reviewNeeded && !authRecord.extractionError && !authRecord.parseError) {
      return '';
    }

    var reasons = [];
    if (authRecord.extractionError) {
      reasons.push(escapeHtml_(authRecord.extractionError));
    }
    if (authRecord.parseError) {
      reasons.push(escapeHtml_(authRecord.parseError));
    }
    if (review.reviewNeeded && reasons.length === 0) {
      reasons.push('One or more required fields are missing or low confidence.');
    }

    return (
      '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;' +
      'padding:12px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;">' +
      '<strong>⚠️ NEEDS MANUAL REVIEW</strong>' +
      (reasons.length
        ? '<ul style="margin:8px 0 0 18px;padding:0;">' +
          reasons
            .map(function (reason) {
              return '<li>' + reason + '</li>';
            })
            .join('') +
          '</ul>'
        : '') +
      '</div>'
    );
  }

  /** @param {{intro: string}} typeInfo */
  function buildIntro_(typeInfo) {
    return (
      '<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
      escapeHtml_(typeInfo.intro) +
      '</p>'
    );
  }

  /** @param {Object} authRecord */
  function buildNpiNote_(authRecord) {
    var status = authRecord.npiLookupStatus || '';
    var npi = authRecord.npiNumber || AuthRecordFields.getValue(authRecord, 'npiNumber');
    var provider =
      authRecord.referringProvider || AuthRecordFields.getValue(authRecord, 'referringProvider');

    if (status === 'matched' && npi) {
      return (
        '<div style="background:#e6f4ea;border:1px solid #1e8e3e;border-radius:4px;' +
        'padding:10px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#0d652d;">' +
        '<strong>NPI matched:</strong> ' +
        escapeHtml_(npi) +
        (authRecord.npiMatchedName
          ? ' <span style="color:#137333;">(directory: ' +
            escapeHtml_(authRecord.npiMatchedName) +
            ')</span>'
          : '') +
        '</div>'
      );
    }

    if (status === 'ambiguous') {
      return (
        '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;' +
        'padding:10px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;">' +
        '<strong>NPI lookup ambiguous</strong> for referring provider ' +
        escapeHtml_(provider || '(unknown)') +
        '. Candidates: ' +
        escapeHtml_(authRecord.npiMatchedName || 'multiple') +
        '. Confirm manually before using an NPI.' +
        '</div>'
      );
    }

    if (status === 'not_found' && provider) {
      return (
        '<div style="background:#f1f3f4;border:1px solid #dadce0;border-radius:4px;' +
        'padding:10px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#3c4043;">' +
        'No NPI directory match for referring provider <strong>' +
        escapeHtml_(provider) +
        '</strong>.' +
        '</div>'
      );
    }

    if (status === 'not_configured' || status === 'error') {
      return (
        '<div style="background:#fce8e6;border:1px solid #fad2cf;border-radius:4px;' +
        'padding:10px 16px;margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#a50e0e;">' +
        'NPI directory lookup unavailable' +
        (authRecord.npiLookupError ? ': ' + escapeHtml_(authRecord.npiLookupError) : '.') +
        '</div>'
      );
    }

    return '';
  }

  /** @param {Object} authRecord @param {Object.<string, boolean>} flaggedSet */
  function buildFieldTable_(authRecord, flaggedSet) {
    var rows = AuthRecordFields.FIELD_KEYS.map(function (key) {
      var value = AuthRecordFields.getValue(authRecord, key);
      var confidence = AuthRecordFields.getConfidence(authRecord, key);
      var displayValue = formatFieldValue_(key, value);
      var flagged = flaggedSet[key];
      var valueStyle =
        'padding:8px 12px;border-bottom:1px solid #e0e0e0;font-family:Arial,sans-serif;font-size:14px;';
      if (flagged) {
        valueStyle += 'background:#fff8e1;';
      }

      var prefix = flagged ? '⚠️ ' : '';
      var suffix = confidence === 'missing' && !value ? ' <span style="color:#888;">(not found)</span>' : '';

      return (
        '<tr>' +
        '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid #e0e0e0;' +
        'font-family:Arial,sans-serif;font-size:14px;white-space:nowrap;vertical-align:top;' +
        'background:#f7f7f7;width:220px;">' +
        escapeHtml_(AuthRecordFields.getLabel(key)) +
        '</th>' +
        '<td style="' +
        valueStyle +
        '">' +
        prefix +
        escapeHtml_(displayValue) +
        suffix +
        '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<table style="border-collapse:collapse;width:100%;max-width:720px;margin:0 0 16px;' +
      'border:1px solid #e0e0e0;">' +
      rows +
      '</table>'
    );
  }

  /** @param {string} key @param {string} value */
  function formatFieldValue_(key, value) {
    if (!value) {
      return '—';
    }
    if (key === 'authType') {
      return AuthRecordFields.getAuthTypeInfo(value).label;
    }
    return value;
  }

  /** @param {string} sourceUrl */
  function buildSourceLink_(sourceUrl) {
    if (!sourceUrl) {
      return '';
    }

    return (
      '<p style="font-family:Arial,sans-serif;font-size:14px;margin:16px 0;">' +
      '<a href="' +
      escapeHtml_(sourceUrl) +
      '" style="color:#1a73e8;">▶ View original authorization in Drive</a>' +
      '</p>'
    );
  }

  function buildFooter_() {
    return (
      '<p style="font-family:Arial,sans-serif;font-size:12px;color:#666;margin-top:24px;">' +
      'This is an assist, not an authority. Sent by Auth Extractor (shadow mode).' +
      '</p>'
    );
  }

  /** @param {string} text */
  function escapeHtml_(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { compose: compose };
})();
