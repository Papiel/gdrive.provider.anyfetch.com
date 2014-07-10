'use strict';
/**
 * This object contains all the handlers to use for this providers
 */
var googleapis = require('googleapis');
var rarity = require('rarity');
var async = require('async');
var OAuth2Client = googleapis.OAuth2Client;

var config = require('../config/configuration.js');
var retrieveFiles = require('./helpers/retrieve.js');
var uploadFile = require('./helpers/upload.js');
var deleteFile = require('./helpers/delete.js');
var selectBestDownload = require('./helpers/select-best-download.js');

var redirectToService = function(callbackUrl, cb) {
  googleapis.execute(function(err) {
    if(err) {
      return cb(err);
    }

    var oauth2Client = new OAuth2Client(config.googleId, config.googleSecret, callbackUrl);

    // generate consent page url for Google Drive access, even when user is not connected (offline)
    var redirectUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',
      approval_prompt: 'force', // Force resending a refresh_token
    });

    cb(null, redirectUrl, {redirectUrl: redirectUrl, callbackUrl: callbackUrl});
  });
};

var retrieveTokens = function(reqParams, storedParams, cb) {
  async.waterfall([
    function getClient(cb) {
      googleapis.discover('oauth2', 'v2').execute(cb);
    },
    function getToken(client, cb) {
      var oauth2Client = new OAuth2Client(config.googleId, config.googleSecret, storedParams.callbackUrl);
      oauth2Client.getToken(reqParams.code, rarity.carryAndSlice([oauth2Client, client], 4, cb));
    },
    function getUserInfo(oauth2Client, client, tokens, cb) {
      oauth2Client.credentials = tokens;
      client.oauth2.userinfo.get().withAuthClient(oauth2Client).execute(rarity.carryAndSlice([tokens], 3, cb));
    },
    function callFinalCb(tokens, data, cb) {
      cb(null, data.email, {tokens: tokens, callbackUrl: storedParams.callbackUrl});
    }
  ], cb);
};

var updateAccount = function(serviceData, cursor, queues, cb) {
  // Retrieve all files since last call
  async.waterfall([
    function getClient(cb) {
      googleapis.discover('drive', 'v2').execute(cb);
    },
    function retrieveChanges(client, cb) {
      var options = {
        maxResults: 1000,
        includeDeleted: (!! cursor)
      };
      if(cursor) {
        options.startChangeId = cursor;
      }

      var oauth2Client = new OAuth2Client(config.googleId, config.googleSecret, serviceData.callbackUrl);
      oauth2Client.credentials = serviceData.tokens;

      retrieveFiles(client, oauth2Client, options, [], cb);
    },
    function applyChanges(newCursor, changes, cb) {
      changes.forEach(function(change) {
        var id = "https://docs.google.com/file/d/" + change.fileId;

        if(change.deleted || (cursor && change.file.labels.trashed)) {
          queues.deletion.push({
            title: "Delete " + id,
            id: id
          });
        }
        else {
          var download = selectBestDownload(change.file);

          if(download.url && !change.file.labels.trashed && (!change.file.fileSize || change.file.fileSize < config.maxSize * 1024 * 1024)) {
            queues.addition.push({
              title: change.file.title + download.extension,
              downloadUrl: download.url,
              type: download.type,
              date: change.file.createdDate,
              id: id
            });
          }
        }
      });
        
      cb(null, newCursor);
    }
  ], cb);
};

var additionQueueWorker = function(job, cb) {
  uploadFile(job.task, job.anyfetchClient, job.serviceData.access_token, cb);
};

var deletionQueueWorker = function(job, cb) {
  deleteFile(job.task, job.anyfetchClient, job.serviceData.access_token, cb);
};

module.exports = {
  connectFunctions: {
    redirectToService: redirectToService,
    retrieveTokens: retrieveTokens
  },
  updateAccount: updateAccount,
  workers: {
    addition: additionQueueWorker,
    deletion: deletionQueueWorker
  },

  config: config
};