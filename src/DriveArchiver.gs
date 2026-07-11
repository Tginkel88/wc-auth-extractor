/** Save PDF to Drive archive folder — Slice 2 */
var DriveArchiver = (function () {
  /**
   * @param {GoogleAppsScript.Base.Blob} blob
   * @param {string} [filename]
   * @returns {string} Drive file URL
   */
  function archive(blob, filename) {
    var folder = DriveApp.getFolderById(Config.driveArchiveFolderId);
    var namedBlob = filename ? blob.setName(filename) : blob;
    var file = folder.createFile(namedBlob);
    return file.getUrl();
  }

  return { archive: archive };
})();
