/** @param {string} rawJson @returns {Object} AuthRecord — Slice 3 */
var ResponseParser = (function () {
  /**
   * @param {string} rawJson
   * @returns {Object}
   */
  function parse(rawJson) {
    var record = {
      fields: AuthRecordFields.emptyFields(),
      parseError: null
    };

    var cleaned = stripCodeFences_(rawJson);
    if (!cleaned) {
      record.parseError = 'Empty response from extraction model';
      return AuthRecordFields.flatten(record);
    }

    var parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      record.parseError = 'Invalid JSON: ' + err.message;
      return AuthRecordFields.flatten(record);
    }

    applyLegacyAliases_(parsed);

    AuthRecordFields.FIELD_KEYS.forEach(function (key) {
      record.fields[key] = normalizeField_(parsed[key], key);
    });

    return AuthRecordFields.flatten(record);
  }

  /** @param {*} rawField @param {string} key */
  function normalizeField_(rawField, key) {
    if (rawField === null || rawField === undefined) {
      return AuthRecordFields.emptyField();
    }

    if (typeof rawField === 'string' || typeof rawField === 'number' || typeof rawField === 'boolean') {
      return {
        value: normalizeValue_(rawField, key),
        confidence: rawField === '' || rawField === null ? 'missing' : 'medium'
      };
    }

    if (Array.isArray(rawField)) {
      var joined = rawField
        .map(function (item) {
          return String(item).trim();
        })
        .filter(function (item) {
          return item !== '';
        })
        .join(', ');
      return {
        value: joined,
        confidence: joined ? 'medium' : 'missing'
      };
    }

    if (typeof rawField === 'object') {
      var value = normalizeValue_(rawField.value !== undefined ? rawField.value : rawField.text, key);
      return {
        value: value,
        confidence: normalizeConfidence_(rawField.confidence, value)
      };
    }

    return AuthRecordFields.emptyField();
  }

  /** @param {*} value @param {string} key */
  function normalizeValue_(value, key) {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          return String(item).trim();
        })
        .filter(function (item) {
          return item !== '';
        })
        .join(', ');
    }

    var text = String(value).trim();
    if (key === 'authType') {
      return AuthRecordFields.normalizeAuthType(text);
    }
    if (key === 'approvedVisits') {
      text = text.replace(/[^\d]/g, '');
    }
    if (key === 'adjusterPhone') {
      text = normalizePhone_(text);
    }
    return text;
  }

  /** @param {string} text */
  function normalizePhone_(text) {
    if (!text) {
      return '';
    }
    var digits = text.replace(/\D/g, '');
    if (digits.length === 10) {
      return (
        '(' +
        digits.slice(0, 3) +
        ') ' +
        digits.slice(3, 6) +
        '-' +
        digits.slice(6)
      );
    }
    if (digits.length === 11 && digits.charAt(0) === '1') {
      return (
        '(' +
        digits.slice(1, 4) +
        ') ' +
        digits.slice(4, 7) +
        '-' +
        digits.slice(7)
      );
    }
    return text;
  }

  /** @param {Object} parsed */
  function applyLegacyAliases_(parsed) {
    if (!parsed.carrier && parsed.insurer) {
      parsed.carrier = parsed.insurer;
    }
  }

  /** @param {*} confidence @param {string} value */
  function normalizeConfidence_(confidence, value) {
    if (!value) {
      return 'missing';
    }
    var normalized = String(confidence || 'medium')
      .trim()
      .toLowerCase();
    if (AuthRecordFields.CONFIDENCE_LEVELS.indexOf(normalized) === -1) {
      return 'medium';
    }
    return normalized;
  }

  /** @param {string} text */
  function stripCodeFences_(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) {
      return '';
    }
    var fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  return { parse: parse };
})();
