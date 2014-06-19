"use strict";

var subjob = require('./subjob.js');
var selectBestDownload = require('../helpers/select-best-download.js');

var PREFIX = "http://gdrive.provider.anyfetch.com/";

module.exports = function (job, app) {
  var queue = app.get('queue');

  return function spawnUploadJobs(changes) {
    var lastChangeId = null;
    changes.forEach(function(change) {
      var file = change.file;
      var id = PREFIX + file.id;
      lastChangeId = change.id;
      if(file.deleted || (job.data.cursor && file.labels.trashed)) {
        subjob.create(queue, 'deletion', {
          title: "Delete " + id,
          anyfetchToken: job.data.anyfetchToken,
          id: id
        });
      } else {
        var download = selectBestDownload(file);
        if(download.url && !file.labels.trashed && file.fileSize < app.get('maxSize') * 1024 * 1024) {
          subjob.create(queue, 'upload', {
            title: file.title + download.extension,
            anyfetchToken: job.data.anyfetchToken,
            providerToken: job.data.providerToken,
            downloadUrl: download.url,
            showAction: file.alternateLink,
            type: download.type,
            id: id
          });
        }
      }
    });
  };
};
