/** @param {Object} authRecord @returns {{reviewNeeded: boolean, flaggedFields: string[]}} — Slice 4 */
var ReviewPolicy = (function () {
  var BASE_REQUIRED_FIELDS = [
    'authType',
    'patientName',
    'dateOfBirth',
    'carrier',
    'authNumber'
  ];

  var TYPE_REQUIRED_FIELDS = {
    work_comp: ['insured', 'claimNumber', 'authDateRange', 'approvedVisits'],
    mva: ['claimNumber', 'authDateRange', 'approvedVisits'],
    private_imaging: [],
    unknown: ['insured', 'claimNumber', 'authDateRange', 'approvedVisits']
  };

  // Backward-compatible export used by tests / callers expecting a flat list.
  var REQUIRED_FIELDS = BASE_REQUIRED_FIELDS.concat(TYPE_REQUIRED_FIELDS.work_comp);

  /**
   * @param {Object} authRecord
   * @returns {{reviewNeeded: boolean, flaggedFields: string[]}}
   */
  function evaluate(authRecord) {
    var requiredFields = requiredFieldsFor_(authRecord);

    if (authRecord.extractionError || authRecord.parseError) {
      return {
        reviewNeeded: true,
        flaggedFields: requiredFields.slice()
      };
    }

    var flaggedFields = [];
    var fields = authRecord.fields || {};

    AuthRecordFields.FIELD_KEYS.forEach(function (key) {
      if (shouldFlagField_(key, fields[key], requiredFields)) {
        flaggedFields.push(key);
      }
    });

    var reviewNeeded = requiredFields.some(function (key) {
      return isRequiredFieldAtRisk_(fields[key], key);
    });

    if (authRecord.npiLookupStatus === 'ambiguous') {
      reviewNeeded = true;
      if (flaggedFields.indexOf('npiNumber') === -1) {
        flaggedFields.push('npiNumber');
      }
      if (flaggedFields.indexOf('referringProvider') === -1) {
        flaggedFields.push('referringProvider');
      }
    }

    return {
      reviewNeeded: reviewNeeded,
      flaggedFields: flaggedFields
    };
  }

  /** @param {Object} authRecord @returns {string[]} */
  function requiredFieldsFor_(authRecord) {
    var authType = AuthRecordFields.normalizeAuthType(
      AuthRecordFields.getValue(authRecord, 'authType') || authRecord.authType || ''
    );
    var extras = TYPE_REQUIRED_FIELDS[authType] || TYPE_REQUIRED_FIELDS.unknown;
    return BASE_REQUIRED_FIELDS.concat(extras);
  }

  /**
   * @param {string} key
   * @param {{value: string, confidence: string}|undefined} field
   * @param {string[]} requiredFields
   */
  function shouldFlagField_(key, field, requiredFields) {
    var normalized = field || AuthRecordFields.emptyField();
    var value = String(normalized.value || '').trim();
    var confidence = normalized.confidence || 'missing';
    var isRequired = requiredFields.indexOf(key) !== -1;

    if (key === 'authType' && (value === '' || value === 'unknown')) {
      return true;
    }

    if (confidence === 'low') {
      return isRequired || value !== '';
    }

    if (confidence === 'missing') {
      return isRequired;
    }

    return isRequired && value === '';
  }

  /** @param {{value: string, confidence: string}|undefined} field @param {string} [key] */
  function isRequiredFieldAtRisk_(field, key) {
    var normalized = field || AuthRecordFields.emptyField();
    var value = String(normalized.value || '').trim();
    var confidence = normalized.confidence || 'missing';

    if (key === 'authType' && (value === '' || value === 'unknown')) {
      return true;
    }

    if (!value) {
      return true;
    }

    return confidence === 'low' || confidence === 'missing';
  }

  return {
    evaluate: evaluate,
    REQUIRED_FIELDS: REQUIRED_FIELDS
  };
})();
