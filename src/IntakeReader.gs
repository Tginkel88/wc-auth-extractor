/** Gmail label intake — Slice 2 */
var IntakeReader = (function () {
  /**
   * @returns {Array<{thread: GoogleAppsScript.Gmail.GmailThread, message: GoogleAppsScript.Gmail.GmailMessage, messageId: string, subject: string, pdfBlob: GoogleAppsScript.Base.Blob|null}>}
   */
  function fetchPending() {
    var pendingLabel = getLabel_(Config.labelPending);
    var threads = pendingLabel.getThreads(0, 50);
    var items = [];

    threads.forEach(function (thread) {
      var message = getLatestMessage_(thread);
      items.push({
        thread: thread,
        message: message,
        messageId: message.getId(),
        subject: message.getSubject(),
        pdfBlob: extractPdfAttachment_(message)
      });
    });

    return items;
  }

  /** @param {GoogleAppsScript.Gmail.GmailThread} thread */
  function markProcessed(thread) {
    var pendingLabel = getLabel_(Config.labelPending);
    var processedLabel = getLabel_(Config.labelProcessed);
    thread.removeLabel(pendingLabel);
    thread.addLabel(processedLabel);
  }

  /** @param {string} labelName */
  function getLabel_(labelName) {
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      throw new Error('Gmail label not found: ' + labelName);
    }
    return label;
  }

  /** @param {GoogleAppsScript.Gmail.GmailThread} thread */
  function getLatestMessage_(thread) {
    var messages = thread.getMessages();
    return messages[messages.length - 1];
  }

  /** @param {GoogleAppsScript.Gmail.GmailMessage} message */
  function extractPdfAttachment_(message) {
    var attachments = message.getAttachments({
      includeInlineImages: false,
      includeAttachments: true
    });
    var pdfs = [];

    attachments.forEach(function (attachment) {
      if (isPdfAttachment_(attachment)) {
        pdfs.push(attachment);
      }
    });

    if (pdfs.length === 0) {
      return null;
    }

    if (pdfs.length === 1) {
      return pdfs[0];
    }

    pdfs.sort(function (a, b) {
      return b.getBytes().length - a.getBytes().length;
    });
    Logger.log(
      'Multiple PDF attachments on message ' +
        message.getId() +
        '; archiving largest (' +
        pdfs[0].getName() +
        ')'
    );
    return pdfs[0];
  }

  /** @param {GoogleAppsScript.Base.Blob} attachment */
  function isPdfAttachment_(attachment) {
    var name = attachment.getName().toLowerCase();
    return attachment.getContentType() === 'application/pdf' || name.slice(-4) === '.pdf';
  }

  return { fetchPending: fetchPending, markProcessed: markProcessed };
})();
