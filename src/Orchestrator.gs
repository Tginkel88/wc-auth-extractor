/**
 * Entry point invoked by the time-driven trigger (Slice 2+).
 */
function run() {
  Orchestrator.run();
}

/** One-time setup: run from the Apps Script editor to enable the 10-minute trigger. */
function installTrigger() {
  Orchestrator.installTrigger();
}

var Orchestrator = (function () {
  function run() {
    var pending = IntakeReader.fetchPending();
    Logger.log('Pending WC auths: ' + pending.length);

    pending.forEach(function (item) {
      processItem_(item);
    });
  }

  /** @param {{thread: *, message: *, messageId: string, subject: string, pdfBlob: *}} item */
  function processItem_(item) {
    if (!item.pdfBlob) {
      Logger.log('No PDF attachment on message ' + item.messageId);
      AuditLogger.log(
        {
          messageId: item.messageId,
          status: 'no_pdf'
        },
        '',
        false
      );
      IntakeReader.markProcessed(item.thread);
      return;
    }

    var driveUrl = '';
    try {
      var filename = buildArchiveFilename_(item);
      driveUrl = DriveArchiver.archive(item.pdfBlob.copyBlob(), filename);
      Logger.log('Archived message ' + item.messageId + ' → ' + driveUrl);
    } catch (err) {
      Logger.log('Failed to archive message ' + item.messageId + ': ' + err);
      AuditLogger.log(
        {
          messageId: item.messageId,
          status: 'archive_failed'
        },
        '',
        false
      );
      return;
    }

    var authRecord = extractAuthRecord_(item.pdfBlob);
    authRecord.messageId = item.messageId;
    authRecord.driveUrl = driveUrl;
    DoctorNpiLookup.enrich(authRecord);
    AuthRecordFields.flatten(authRecord);

    var review = ReviewPolicy.evaluate(authRecord);
    var emailContent = EmailComposer.compose(authRecord, driveUrl, review);
    var emailResult = sendNotificationEmail_(emailContent, driveUrl, authRecord);

    authRecord.status = determineStatus_(authRecord, emailResult);
    AuditLogger.log(authRecord, emailResult.recipients, review.reviewNeeded);
    IntakeReader.markProcessed(item.thread);
    Logger.log(
      'Processed message ' +
        item.messageId +
        ' — type: ' +
        AuthRecordFields.getAuthTypeInfo(authRecord).key +
        ', patient: ' +
        (authRecord.patientName || '(unknown)') +
        ', status: ' +
        authRecord.status +
        ', email: ' +
        (emailResult.sent ? 'sent' : 'skipped')
    );
  }

  /** @param {GoogleAppsScript.Base.Blob} pdfBlob */
  function extractAuthRecord_(pdfBlob) {
    try {
      return AuthExtractor.extract(pdfBlob);
    } catch (err) {
      Logger.log('Extraction failed: ' + err);
      return AuthRecordFields.flatten({
        fields: AuthRecordFields.emptyFields(),
        extractionError: String(err)
      });
    }
  }

  /**
   * @param {{subject: string, html: string}} emailContent
   * @param {string} sourceUrl
   * @param {Object} [authRecord]
   * @returns {{sent: boolean, recipients: string}}
   */
  function sendNotificationEmail_(emailContent, sourceUrl, authRecord) {
    var routing = resolveRecipients_();
    if (!routing.to) {
      Logger.log('No email recipient configured — skipping send');
      return { sent: false, recipients: '' };
    }

    var typeInfo = AuthRecordFields.getAuthTypeInfo(authRecord || {});
    var plainBody =
      typeInfo.label +
      ' summary.\n\n' +
      'View the original document: ' +
      sourceUrl +
      '\n\nOpen this message in HTML for the full field breakdown.';

    try {
      var options = {
        htmlBody: emailContent.html,
        name: 'Auth Extractor'
      };
      if (routing.cc.length > 0) {
        options.cc = routing.cc.join(',');
      }

      GmailApp.sendEmail(routing.to, emailContent.subject, plainBody, options);
      return { sent: true, recipients: formatRecipients_(routing) };
    } catch (err) {
      Logger.log('Failed to send email: ' + err);
      return { sent: false, recipients: formatRecipients_(routing) };
    }
  }

  /** @returns {{to: string, cc: string[]}} */
  function resolveRecipients_() {
    if (Config.shadowMode) {
      return { to: Config.shadowRecipient, cc: [] };
    }

    return {
      to: Config.productionTo,
      cc: Config.productionCc || []
    };
  }

  /** @param {{to: string, cc: string[]}} routing */
  function formatRecipients_(routing) {
    var parts = [];
    if (routing.to) {
      parts.push(routing.to);
    }
    if (routing.cc && routing.cc.length > 0) {
      parts = parts.concat(routing.cc);
    }
    return parts.join(', ');
  }

  /**
   * @param {Object} authRecord
   * @param {{sent: boolean}} emailResult
   */
  function determineStatus_(authRecord, emailResult) {
    if (!emailResult.sent) {
      if (authRecord.extractionError || authRecord.parseError) {
        return 'extraction_failed';
      }
      return 'email_skipped';
    }

    if (authRecord.extractionError || authRecord.parseError) {
      return 'extraction_failed';
    }

    return 'emailed';
  }

  /** @param {{messageId: string, subject: string}} item */
  function buildArchiveFilename_(item) {
    var timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd_HHmmss'
    );
    var safeSubject = item.subject
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80);
    var base = safeSubject || item.messageId;
    return timestamp + '_' + base + '.pdf';
  }

  /**
   * Installs one daily trigger per hour in Config.scheduleHours (default every 3h:
   * 12am, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm in the script timezone).
   * Apps Script runs near the hour (usually within ~15 minutes), not to the minute.
   */
  function installTrigger() {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === 'run') {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    var hours = Config.scheduleHours || [0, 3, 6, 9, 12, 15, 18, 21];
    hours.forEach(function (hour) {
      ScriptApp.newTrigger('run').timeBased().atHour(hour).everyDays(1).create();
    });

    Logger.log(
      'Installed daily triggers for run() at hours: ' +
        hours.join(', ') +
        ' (script TZ: ' +
        Session.getScriptTimeZone() +
        ')'
    );
  }

  return { run: run, installTrigger: installTrigger };
})();
