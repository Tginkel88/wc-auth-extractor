/** Shared field definitions for AuthRecord — Slice 3 */
var AuthRecordFields = (function () {
  var AUTH_TYPES = {
    work_comp: {
      key: 'work_comp',
      label: 'Work Comp Authorization',
      subjectPrefix: 'WC Auth',
      intro:
        'Extracted work-comp authorization summary. Verify every field against the source document before entering it into practice systems.'
    },
    mva: {
      key: 'mva',
      label: 'Motor Vehicle Accident Authorization',
      subjectPrefix: 'MVA Auth',
      intro:
        'Extracted motor vehicle accident (MVA) authorization summary. Verify every field against the source document before entering it into practice systems.'
    },
    private_imaging: {
      key: 'private_imaging',
      label: 'Private Insurance / Imaging Referral',
      subjectPrefix: 'Imaging Referral',
      intro:
        'Extracted private insurance or imaging referral summary. Verify every field against the source document before entering it into practice systems.'
    },
    unknown: {
      key: 'unknown',
      label: 'Unknown Authorization Type',
      subjectPrefix: 'Auth',
      intro:
        'Extracted authorization/referral summary (type could not be determined confidently). Verify every field against the source document before entering it into practice systems.'
    }
  };

  var AUTH_TYPE_KEYS = Object.keys(AUTH_TYPES);

  var FIELD_KEYS = [
    'authType',
    'patientName',
    'dateOfBirth',
    'referringProvider',
    'npiNumber',
    'carrier',
    'insured',
    'employer',
    'adjusterName',
    'adjusterPhone',
    'claimNumber',
    'memberNumber',
    'wcabCaseNumber',
    'authNumber',
    'authDateRange',
    'approvedVisits',
    'cptCodes',
    'icd10Codes',
    'bodyRegions'
  ];

  // Populated by DoctorNpiLookup after extraction — not requested from Gemini.
  var LOOKUP_ONLY_FIELDS = ['npiNumber'];

  var FIELD_LABELS = {
    authType: 'Authorization Type',
    patientName: 'Patient Name',
    dateOfBirth: 'Date of Birth',
    referringProvider: 'Referring Provider',
    npiNumber: 'NPI Number',
    carrier: 'Carrier / Insurer / TPA',
    insured: 'Insured / Policyholder',
    employer: 'Employer',
    adjusterName: 'Adjuster Name',
    adjusterPhone: 'Adjuster Phone',
    claimNumber: 'Claim Number',
    memberNumber: 'Member / Subscriber Number',
    wcabCaseNumber: 'WCAB / Case Number',
    authNumber: 'Authorization Number (also Review Number / Referral ID)',
    authDateRange: 'Authorization Date Range',
    approvedVisits: 'Approved Visits',
    cptCodes: 'CPT Procedure Codes',
    icd10Codes: 'ICD-10 Diagnosis Codes',
    bodyRegions: 'Body Regions'
  };

  var CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'missing'];

  function emptyField() {
    return { value: '', confidence: 'missing' };
  }

  function emptyFields() {
    var fields = {};
    FIELD_KEYS.forEach(function (key) {
      fields[key] = emptyField();
    });
    return fields;
  }

  /**
   * @param {Object} record
   * @returns {Object}
   */
  function flatten(record) {
    FIELD_KEYS.forEach(function (key) {
      record[key] = getValue(record, key);
    });
    return record;
  }

  /**
   * @param {Object} record
   * @param {string} key
   * @returns {string}
   */
  function getValue(record, key) {
    if (!record.fields || !record.fields[key]) {
      return '';
    }
    return record.fields[key].value || '';
  }

  /**
   * @param {string} key
   * @returns {string}
   */
  function getLabel(key) {
    return FIELD_LABELS[key] || key;
  }

  /**
   * @param {Object} record
   * @param {string} key
   * @returns {string}
   */
  function getConfidence(record, key) {
    if (!record.fields || !record.fields[key]) {
      return 'missing';
    }
    return record.fields[key].confidence || 'missing';
  }

  /**
   * @param {string} rawType
   * @returns {string}
   */
  function normalizeAuthType(rawType) {
    var text = String(rawType || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (AUTH_TYPES[text]) {
      return text;
    }

    if (
      text.indexOf('work_comp') !== -1 ||
      text.indexOf('workers_comp') !== -1 ||
      text === 'wc' ||
      text === 'workcomp' ||
      text.indexOf('workers_compensation') !== -1
    ) {
      return 'work_comp';
    }

    if (text.indexOf('mva') !== -1 || text.indexOf('motor_vehicle') !== -1 || text.indexOf('auto') !== -1) {
      return 'mva';
    }

    if (
      text.indexOf('private') !== -1 ||
      text.indexOf('imaging') !== -1 ||
      text.indexOf('commercial') !== -1 ||
      text.indexOf('third_party') !== -1
    ) {
      return 'private_imaging';
    }

    return text ? 'unknown' : '';
  }

  /**
   * @param {string|Object} recordOrType
   * @returns {{key: string, label: string, subjectPrefix: string, intro: string}}
   */
  function getAuthTypeInfo(recordOrType) {
    var raw =
      typeof recordOrType === 'string'
        ? recordOrType
        : getValue(recordOrType || {}, 'authType') || (recordOrType && recordOrType.authType) || '';
    var key = normalizeAuthType(raw) || 'unknown';
    return AUTH_TYPES[key] || AUTH_TYPES.unknown;
  }

  return {
    FIELD_KEYS: FIELD_KEYS,
    FIELD_LABELS: FIELD_LABELS,
    LOOKUP_ONLY_FIELDS: LOOKUP_ONLY_FIELDS,
    CONFIDENCE_LEVELS: CONFIDENCE_LEVELS,
    AUTH_TYPES: AUTH_TYPES,
    AUTH_TYPE_KEYS: AUTH_TYPE_KEYS,
    emptyField: emptyField,
    emptyFields: emptyFields,
    flatten: flatten,
    getValue: getValue,
    getLabel: getLabel,
    getConfidence: getConfidence,
    normalizeAuthType: normalizeAuthType,
    getAuthTypeInfo: getAuthTypeInfo
  };
})();
