var assert = require('assert');
var Event = require('../../../src/server/sonos/event');

describe('parse timeout header', function() {
  it('is a valid timeout header', function() {
    var timeout = Event.parseTimeout('Second-1');
    assert.equal(timeout, 1);
  });

  it('is not a valid timeout number', function() {
    var timeout = Event.parseTimeout('Timeout-1');
    assert.equal(timeout, Event.DEFAULT_TIMEOUT);
  });

  it('is not a valid timeout header', function() {
    var timeout = Event.parseTimeout('Timeout');
    assert.equal(timeout, Event.DEFAULT_TIMEOUT);
  });
});

describe('parse http error', function() {
  it('is a successful http response', function() {
    var res = {
      statusCode: 200
    };
    var error = Event.parseHttpError(res);
    assert.equal(error, null);
  });

  it('is a 400 error response', function() {
    var res = {
      statusCode: 400,
      headers: []
    };
    var error = Event.parseHttpError(res);
    assert.equal(error.message, 'Incompatible header fields');
    assert.equal(error.details.statusCode, 400);
    assert.ok('headers' in error.details);
  });

  it('is a 500 error response', function() {
    var res = {
      statusCode: 501
    };
    var error = Event.parseHttpError(res);
    assert.equal(error.message, 'Unable to accept renewal');
  });

  it('is an unknown error response', function() {
    var res = {
      statusCode: 1
    };
    var error = Event.parseHttpError(res);
    assert.equal(error.message, 'HTTP status code 1');
  });
});

describe('creating an Event', function() {
  it('creates a new empty Event', function() {
    var event = new Event();
    assert.equal(event.sid, null);
    assert.equal(event.timeout, 43200);
    assert.equal(event.timeoutId, null);
  });
});

describe('Event request', function() {
  it('checks the speaker options', function() {
    var event = new Event({
        'speakerIp': '1.2.3.4',
        'port': 80,
        'path': '/foo/bar'});
    Event.request = function(options, successCallback, errorCallback) {
      assert.equal(options.hostname, '1.2.3.4');
      assert.equal(options.port, 80);
      assert.equal(options.path, '/foo/bar');
    };
    event.request();
  });

  it('recieves an error response', function() {
    var event = new Event({
        'speakerIp': '1.2.3.4',
        'port': 80,
        'path': '/foo/bar'});
    Event.request = function(options, successCallback, errorCallback) {
      successCallback({statusCode: 512});
    };
    event.request({}, function(error, res) {
      assert.ok(error !== null);
      assert.ok(res === null);
    });
  });

  it('recieves a successful response', function() {
    var event = new Event({
        'speakerIp': '1.2.3.4',
        'port': 80,
        'path': '/foo/bar'});
    Event.request = function(options, successCallback, errorCallback) {
      successCallback({statusCode: 200});
    };
    event.request({}, function(error, res) {
      assert.ok(error === null);
      assert.ok(res !== null);
    });
  });

  it('recieves an error', function() {
    var event = new Event({
        'speakerIp': '1.2.3.4',
        'port': 80,
        'path': '/foo/bar'});
    Event.request = function(options, successCallback, errorCallback) {
      errorCallback({});
    };
    event.request({}, function(error, res) {
      assert.ok(error !== null);
      assert.ok(res === null);
    });
  });
});

describe('Unsubscribe', function() {
  it('has no SID', function() {
    var event = new Event();
    assert.throws(
      function() { event.unsubscribe(); },
      function(e) {
        if (e.message === 'Must specify a SID.') {
          return true;
        }
        return false;
      });
  });

  it('has valid http values', function() {
    var event = new Event();
    event.sid = '123';
    event.request = function(opts) {
      assert.equal(opts.method, 'UNSUBSCRIBE');
      assert.equal(opts.headers.SID, '123');
    };
    event.unsubscribe();
  });

  it('has an error when unsubscribing', function() {
    var event = new Event();
    event.sid = '123';
    event.request = function(opts, callback) {
      callback(new Error('Error'), null);
    };
    event.unsubscribe(function(err, data) {
      assert.ok(err !== null);
      assert.equal(err.message, 'Error');
      assert.ok(data === null);
    });
  });
});
