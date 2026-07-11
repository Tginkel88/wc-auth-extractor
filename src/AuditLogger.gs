/** Append row to bound audit Sheet — Slice 2 */
var AuditLogger = (function () {
  var HEADERS = [
    'Timestamp',
    'Auth Type',
    'Patient',
    'Referring Provider',
    'NPI #',
    'Claim #',
    'Auth #',
    'Visits',
    'Recipients',
    'Review Needed',
    'Drive URL',
    'Message ID',
    'Status'
  ];

  /**
   * @param {Object} authRecord
   * @param {string|string[]} recipients
   * @param {boolean} reviewNeeded
   */
  function log(authRecord, recipients, reviewNeeded) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    ensureHeaders_(sheet);

    var recipientText = formatRecipients_(recipients);
    var typeInfo = AuthRecordFields.getAuthTypeInfo(authRecord);
    sheet.appendRow([
      new Date(),
      typeInfo.label,
      authRecord.patientName || '',
      authRecord.referringProvider || '',
      authRecord.npiNumber || '',
      authRecord.claimNumber || '',
      authRecord.authNumber || '',
      authRecord.approvedVisits || '',
      recipientText,
      reviewNeeded ? 'YES' : 'NO',
      authRecord.driveUrl || '',
      authRecord.messageId || '',
      authRecord.status || 'archived'
    ]);
  }

  /** @param {GoogleAppsScript.Spreadsheet.Sheet} sheet */
  function ensureHeaders_(sheet) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      return;
    }

    var firstCell = String(sheet.getRange(1, 1).getValue() || '');
    if (!firstCell) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return;
    }

    var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (headerRow[0] !== 'Timestamp') {
      return;
    }

    ensureColumnAfter_(sheet, headerRow, 'Timestamp', 'Auth Type');
    headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureColumnAfter_(sheet, headerRow, 'Auth Type', 'Patient');
    headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureColumnAfter_(sheet, headerRow, 'Patient', 'Referring Provider');
    headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureColumnAfter_(sheet, headerRow, 'Referring Provider', 'NPI #');
    headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var mpiIdx = headerRow.indexOf('MPI #');
    if (mpiIdx !== -1 && headerRow.indexOf('NPI #') === -1) {
      sheet.getRange(1, mpiIdx + 1).setValue('NPI #');
    }
  }

  /**
   * Inserts headerName immediately after afterHeader when missing.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Array} headerRow
   * @param {string} afterHeader
   * @param {string} headerName
   */
  function ensureColumnAfter_(sheet, headerRow, afterHeader, headerName) {
    if (headerRow.indexOf(headerName) !== -1) {
      return;
    }
    var afterIdx = headerRow.indexOf(afterHeader);
    if (afterIdx === -1) {
      return;
    }
    sheet.insertColumnAfter(afterIdx + 1);
    sheet.getRange(1, afterIdx + 2).setValue(headerName);
  }

  /** @param {string|string[]} recipients */
  function formatRecipients_(recipients) {
    if (!recipients) {
      return '';
    }
    if (Array.isArray(recipients)) {
      return recipients.join(', ');
    }
    return String(recipients);
  }

  return { log: log };
})();
