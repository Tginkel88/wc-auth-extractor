/**
 * Looks up referring-provider NPI numbers from an external Google Sheet directory.
 * Matching is name-based (normalized); NPI is never guessed from the PDF alone.
 */
var DoctorNpiLookup = (function () {
  var directoryCache_ = null;

  var DOCTOR_HEADER_ALIASES = [
    'doctor',
    'doctor name',
    'physician',
    'physician name',
    'provider',
    'provider name',
    'referring provider',
    'referring doctor',
    'name'
  ];

  var NPI_HEADER_ALIASES = [
    'npi',
    'npi number',
    'npi #',
    'npi no',
    'mpi',
    'mpi number',
    'mpi #',
    'mpi no',
    'pi',
    'pi number',
    'pi #',
    'p.i.',
    'p.i. number',
    'p.i #'
  ];

  /**
   * Enrich an AuthRecord with npiNumber when the referring provider matches the directory.
   * @param {Object} authRecord
   * @returns {Object} same record, mutated
   */
  function enrich(authRecord) {
    ensureNpiField_(authRecord);

    var cfg = Config.doctorNpiSheet || {};
    if (!cfg.spreadsheetId) {
      Logger.log('Doctor NPI sheet not configured (Config.doctorNpiSheet.spreadsheetId)');
      setNpi_(authRecord, '', 'missing');
      authRecord.npiLookupStatus = 'not_configured';
      return authRecord;
    }

    var referringProvider =
      AuthRecordFields.getValue(authRecord, 'referringProvider') || authRecord.referringProvider || '';
    if (!String(referringProvider).trim()) {
      setNpi_(authRecord, '', 'missing');
      authRecord.npiLookupStatus = 'no_referring_provider';
      return authRecord;
    }

    try {
      var match = findMatch_(referringProvider);
      if (!match) {
        setNpi_(authRecord, '', 'missing');
        authRecord.npiLookupStatus = 'not_found';
        Logger.log('No NPI match for referring provider: ' + referringProvider);
        return authRecord;
      }

      if (match.ambiguous) {
        setNpi_(authRecord, '', 'low');
        authRecord.npiLookupStatus = 'ambiguous';
        authRecord.npiMatchedName = match.candidates
          .map(function (c) {
            return c.name;
          })
          .join(' | ');
        Logger.log(
          'Ambiguous NPI match for "' + referringProvider + '": ' + authRecord.npiMatchedName
        );
        return authRecord;
      }

      setNpi_(authRecord, match.npi, 'high');
      authRecord.npiLookupStatus = 'matched';
      authRecord.npiMatchedName = match.name;
      Logger.log(
        'NPI matched for "' + referringProvider + '" → ' + match.name + ' / ' + match.npi
      );
      return authRecord;
    } catch (err) {
      Logger.log('Doctor NPI lookup failed: ' + err);
      setNpi_(authRecord, '', 'missing');
      authRecord.npiLookupStatus = 'error';
      authRecord.npiLookupError = String(err);
      return authRecord;
    }
  }

  /** @param {string} referringProvider */
  function findMatch_(referringProvider) {
    var directory = loadDirectory_();
    if (directory.length === 0) {
      return null;
    }

    var query = normalizeDoctorName_(referringProvider);
    if (!query.normalized) {
      return null;
    }

    var exact = [];
    var fuzzy = [];

    directory.forEach(function (entry) {
      if (!entry.normalized || !entry.npi) {
        return;
      }

      if (entry.normalized === query.normalized || entry.key === query.key) {
        exact.push(entry);
        return;
      }

      if (namesLooselyMatch_(query, entry)) {
        fuzzy.push(entry);
      }
    });

    if (exact.length === 1) {
      return { name: exact[0].name, npi: exact[0].npi, ambiguous: false };
    }
    if (exact.length > 1) {
      return { ambiguous: true, candidates: exact };
    }

    if (fuzzy.length === 1) {
      return { name: fuzzy[0].name, npi: fuzzy[0].npi, ambiguous: false };
    }
    if (fuzzy.length > 1) {
      return { ambiguous: true, candidates: fuzzy };
    }

    return null;
  }

  function loadDirectory_() {
    if (directoryCache_) {
      return directoryCache_;
    }

    var cfg = Config.doctorNpiSheet || {};
    var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
    var sheet = cfg.sheetName ? ss.getSheetByName(cfg.sheetName) : ss.getSheets()[0];
    if (!sheet) {
      throw new Error(
        'Doctor NPI sheet not found' + (cfg.sheetName ? ': ' + cfg.sheetName : ' (workbook empty)')
      );
    }

    var values = sheet.getDataRange().getDisplayValues();
    if (!values || values.length < 2) {
      directoryCache_ = [];
      return directoryCache_;
    }

    var headerRowIndex = Math.max(0, (cfg.headerRow || 1) - 1);
    var headers = values[headerRowIndex] || [];
    var doctorCol = resolveColumn_(headers, cfg.doctorColumn, DOCTOR_HEADER_ALIASES, 'doctor');
    var npiCol = resolveColumn_(headers, cfg.npiColumn, NPI_HEADER_ALIASES, 'npi');

    var entries = [];
    for (var r = headerRowIndex + 1; r < values.length; r++) {
      var row = values[r] || [];
      var name = String(row[doctorCol] || '').trim();
      var npi = String(row[npiCol] || '').trim();
      if (!name || !npi) {
        continue;
      }
      var normalized = normalizeDoctorName_(name);
      entries.push({
        name: name,
        npi: npi,
        normalized: normalized.normalized,
        key: normalized.key,
        lastName: normalized.lastName,
        firstToken: normalized.firstToken,
        tokens: normalized.tokens
      });
    }

    directoryCache_ = entries;
    Logger.log('Loaded ' + entries.length + ' doctor NPI directory rows');
    return directoryCache_;
  }

  /**
   * @param {string[]} headers
   * @param {string|number|undefined} configured
   * @param {string[]} aliases
   * @param {string} label
   */
  function resolveColumn_(headers, configured, aliases, label) {
    if (typeof configured === 'number' && configured >= 0) {
      return configured;
    }

    if (configured) {
      var wanted = normalizeHeader_(configured);
      for (var i = 0; i < headers.length; i++) {
        if (normalizeHeader_(headers[i]) === wanted) {
          return i;
        }
      }
      // Allow A/B style letters
      if (/^[A-Za-z]$/.test(String(configured))) {
        return String(configured).toUpperCase().charCodeAt(0) - 65;
      }
    }

    for (var a = 0; a < aliases.length; a++) {
      var alias = aliases[a];
      for (var h = 0; h < headers.length; h++) {
        if (normalizeHeader_(headers[h]) === alias) {
          return h;
        }
      }
    }

    throw new Error(
      'Could not find ' +
        label +
        ' column in doctor NPI sheet. Set Config.doctorNpiSheet.doctorColumn / npiColumn.'
    );
  }

  /** @param {string} header */
  function normalizeHeader_(header) {
    return String(header || '')
      .trim()
      .toLowerCase()
      .replace(/[_/#]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Credentials / honorifics stripped before matching.
  var CREDENTIAL_TOKENS_RE =
    /\b(dr|doctor|md|m d|do|d o|np|pa|pac|aprn|dc|dpm|phd|rn|pt|dpt|ot|otr|facs|facp)\b/g;

  // Practice / legal-entity suffixes common on referral letterheads.
  var BUSINESS_SUFFIX_RE =
    /\b(inc|incorporated|llc|l l c|pc|p c|pllc|p l l c|corp|corporation|ltd|limited|co|company|assoc|associates|association|group|clinic|medical|medicine|healthcare|health care|services|svc|svcs)\b/g;

  // Generational suffixes that should not become "last name".
  var GENERATIONAL_RE = /\b(jr|sr|ii|iii|iv|v|2nd|3rd|4th)\b/g;

  /**
   * Strip titles/credentials/business suffixes and normalize punctuation so
   * "Raad Al-Shaikh MD INC" and "Dr. Raad Al Shaikh" both become "raad al shaikh".
   *
   * @param {string} rawName
   * @returns {{normalized: string, key: string, lastName: string, firstToken: string, tokens: string[]}}
   */
  function normalizeDoctorName_(rawName) {
    var text = String(rawName || '')
      .toLowerCase()
      .replace(/["""']/g, '')
      .replace(/[./&,+]/g, ' ')
      .replace(/-/g, ' ') // Al-Shaikh → al shaikh
      .replace(CREDENTIAL_TOKENS_RE, ' ')
      .replace(BUSINESS_SUFFIX_RE, ' ')
      .replace(GENERATIONAL_RE, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var tokens = text ? text.split(' ') : [];
    var lastName = tokens.length ? tokens[tokens.length - 1] : '';
    var firstToken = tokens.length ? tokens[0] : '';
    // Sort tokens for order-insensitive exact key ("jane smith" == "smith jane")
    var key = tokens.slice().sort().join(' ');

    return {
      normalized: text,
      key: key,
      lastName: lastName,
      firstToken: firstToken,
      tokens: tokens
    };
  }

  /**
   * @param {{normalized: string, lastName: string, firstToken: string, tokens: string[]}} query
   * @param {{normalized: string, lastName: string, firstToken: string, tokens: string[]}} entry
   */
  function namesLooselyMatch_(query, entry) {
    if (!query.lastName || !entry.lastName) {
      return false;
    }

    var sameLast = query.lastName === entry.lastName;
    // Compound surnames: "al shaikh" vs last token only — require last token match
    // plus shared first name (handled below).
    if (!sameLast) {
      return false;
    }

    // Same last name + matching first token or initial
    if (query.firstToken && entry.firstToken) {
      if (query.firstToken === entry.firstToken) {
        return true;
      }
      if (query.firstToken.charAt(0) === entry.firstToken.charAt(0) && query.firstToken.length === 1) {
        return true;
      }
      if (entry.firstToken.charAt(0) === query.firstToken.charAt(0) && entry.firstToken.length === 1) {
        return true;
      }
    }

    // One normalized name contains the other (handles middle names / leftover noise)
    if (
      query.normalized.indexOf(entry.normalized) !== -1 ||
      entry.normalized.indexOf(query.normalized) !== -1
    ) {
      return true;
    }

    // Token overlap: same last name + ≥1 shared given-name token (middle names, etc.)
    if (query.tokens && entry.tokens && sharedGivenNameToken_(query, entry)) {
      return true;
    }

    return false;
  }

  /** True when query/entry share a non-last-name token (e.g. first or middle). */
  function sharedGivenNameToken_(query, entry) {
    var qGiven = query.tokens.slice(0, -1);
    var eGiven = entry.tokens.slice(0, -1);
    for (var i = 0; i < qGiven.length; i++) {
      for (var j = 0; j < eGiven.length; j++) {
        if (qGiven[i] === eGiven[j]) {
          return true;
        }
      }
    }
    return false;
  }

  /** @param {Object} authRecord */
  function ensureNpiField_(authRecord) {
    if (!authRecord.fields) {
      authRecord.fields = AuthRecordFields.emptyFields();
    }
    if (!authRecord.fields.npiNumber) {
      authRecord.fields.npiNumber = AuthRecordFields.emptyField();
    }
  }

  /** @param {Object} authRecord @param {string} value @param {string} confidence */
  function setNpi_(authRecord, value, confidence) {
    ensureNpiField_(authRecord);
    authRecord.fields.npiNumber = {
      value: value || '',
      confidence: value ? confidence : 'missing'
    };
    authRecord.npiNumber = value || '';
  }

  /** Clear cache between runs (useful in tests / manual reloads). */
  function clearCache() {
    directoryCache_ = null;
  }

  return {
    enrich: enrich,
    clearCache: clearCache,
    _normalizeDoctorName: normalizeDoctorName_
  };
})();
