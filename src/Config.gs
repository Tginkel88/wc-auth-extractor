/**
 * Central configuration. Update SHADOW_RECIPIENT and production emails before go-live.
 * Script is container-bound to the audit Sheet — no Sheet ID needed here.
 */
var Config = (function () {
  return {
    shadowMode: true,
    shadowRecipient: 'drtristan@radiusclinic.com',

    labelPending: 'WC-Auths',
    labelProcessed: 'WC-Processed',

    // Clock hours (script timezone) when run() should fire. Every 3 hours.
    scheduleHours: [0, 3, 6, 9, 12, 15, 18, 21],

    driveArchiveFolderId: '1kISqnklbLKZIyCBpq6Ya_NlQJaX7T5OI',

    vertexProjectId: 'wc-auth-extractor',
    vertexLocation: 'us-central1',
    vertexModel: 'gemini-2.5-flash',

    productionTo: '', // WC coordinator — enabled in Slice 6
    productionCc: [], // manager, biller — enabled in Slice 6

    // Injected into the extraction prompt to reduce carrier vs insured mix-ups.
    extractionHints: {
      insuredExamples: ['Oakwood Village'],
      carrierExamples: ['Corvell', 'CorVel', 'Carewest', 'CareWest']
    },

    /**
     * External directory of referring doctors → NPI numbers.
     * Paste the spreadsheet ID from the Sheet URL (.../d/<SPREADSHEET_ID>/edit).
     * Columns are auto-detected from headers like "name" / "NPI" unless overridden.
     */
    doctorNpiSheet: {
      spreadsheetId: '1ClJYqtlXkwDjjB5XAebwyHuazg4Y-XgHNCNI3WvvefY',
      sheetName: '', // optional; defaults to first tab (gid=0)
      headerRow: 1,
      doctorColumn: 'name', // Column A
      npiColumn: 2 // Column C (0-based). Use 'NPI' or 1 if the ID lives in column B instead.
    }
  };
})();
