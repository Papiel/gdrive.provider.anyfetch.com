"use strict";

var should = require('should');

require('../mock/index.js');
var update = require('../../jobs/update.js');
var clean = require('../helpers/clean.js');
var app = require('../../app.js');

describe("JOB update", function() {
  before(function bindStore() {
    this.store = app.get('keyValueStore');
  });
  beforeEach(clean);

  it('should succeed and fetch the change id', function(done) {
    var job = {
      data: {
        title: "A test update",
        providerToken: 'aGoogleRefreshToken',
        cursor: null,
        anyfetchToken: 'anAccessToken'
      }
    };
    update(app)(job, function assertJobResult(err, changeId) {
      should(err).be.exactly(null);
      changeId.should.be.exactly('change0');
      done();
    });
  });
});
