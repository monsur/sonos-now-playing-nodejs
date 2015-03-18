var http = require('http');
var Logger = require('../utils/logger');

var timeoutPrefix = 'Second-';
var defaultTimeout = 43200;
var defaultCallback = function() {};

var statusCodeMessages = {
  400: 'Incompatible header fields',
  412: 'Precondition failed',
  500: 'Unable to accept renewal'
};

/**
 * The Event class handles the details of a single subscription event.
 * @param {Object} opts - Various options for this instance.
 * @constructor
 */
var Event = function(opts) {
  this.getOptions(opts);
  this.sid = null;
  this.timeout = defaultTimeout;
  this.timeoutId = null;
};

Event.request = function(options, successCallback, errorCallback) {
  var req = http.request(options, successCallback);
  req.on('error', errorCallback);
  req.end();
};

Event.getError = function(res) {
  var statusCode = res.statusCode;
  if (statusCode === 200) {
    return null;
  }

  var msg = null;
  if (statusCode in statusCodeMessages) {
    msg = statusCodeMessages[statusCode];
  } else if (statusCode >= 500) {
    msg = statusCodeMessages[500];
  } else {
    msg = 'HTTP status code ' + statusCode;
  }

  var error = new Error(msg);
  error.details = {
    'statusCode': statusCode,
    'headers': res.headers
  };

  return error;
};

/**
 * Parses a timeout value from the uPnP Timeout header.
 * @param {string} val - The Timeout header value, in the form "Second-NNNN",
 *     where NNNN is the timeout time in seconds.
 * @returns The timeout value in seconds.
 */
Event.parseTimeout = function(val) {
  return parseInt(val.substr(timeoutPrefix.length));
};

Event.setTimeout = function(func, millis) {
  setTimeout(func, millis);
};

Event.clearTimeout = function(id) {
  clearTimeout(id);
};

/**
 * @param {Object} opts - Various options for this instance.
 * @param {string} opts.speakerIp - The IP address of the Sonos speaker.
 * @param {number} opts.port - The port of the Sonos speaker. Defaults to 1440.
 * @param {string} opts.callbackUrl - The full url of where notifications
 *     should be sent.
 * @param {string} opts.path - The path for the subscription event.
 * @param {boolean} opts.autoRenew - Whether to automatically renew this
 *     subscription. Defaults to true.
 */
Event.prototype.getOptions = function(opts) {
  this.speakerIp = opts.speakerIp || this.speakerIp || '';
  this.port = opts.port || this.port || 0;
  this.callbackUrl = opts.callbackUrl || this.callbackUrl || '';
  this.path = opts.path || this.path || '';
  this.autoRenew = opts.autoRenew || this.autoRenew || true; // TODO: fix this.
};

Event.prototype.getHandler = function() {
  return this.handler;
};

Event.prototype.getSid = function() {
  return this.sid;
};

Event.prototype.getPath = function() {
  return this.path;
};

/**
 * Subscribe to a Sonos event.
 * @param {Object} opts - Various options for this instance.
 * @param {Function} handler - The function which fires when an event is
 *     received.
 * @param {Function} callback - The function which fires after the
 *     subscription is complete.
 */
Event.prototype.subscribe = function(opts, handler, callback) {
  getOptions(opts);
  handler = handler || defaultCallback;
  callback = callback || defaultCallback;

  // A subscription requires a callback url.
  if (!this.callbackUrl) {
    throw new Error('Must specify a callback URL.');
  }

  this.handler = handler;

  Logger.info('Subscribing to speaker ' + this.speakerIp + ' with ' + 'callback URL ' +
      this.callbackUrl);

  this.subscribeInternal({
    'CALLBACK': '<' + this.callbackUrl + '>',
    'NT': 'upnp:event'
  }, callback);
};

/**
 * Renews a subscription.
 * @param {Function} callback - The function to call after the renewal is complete.
 */
Event.prototype.renew = function(callback) {
  callback = callback || defaultCallback;

  // A SID is required to renew a subscription.
  if (!this.sid) {
    throw new Error('Must specify a SID.');
  }

  Logger.info('Renewing speaker ' + this.speakerIp + ' with ' + 'SID ' + this.sid +
      ' and timeout ' + this.timeout);

  this.subscribeInternal({
    'SID': this.sid,
    'TIMEOUT': timeoutPrefix + this.timeout
  }, callback);
};

/**
 * Common function to either initiate a new subscription, or renew an existing
 * subscription. A subscription is an HTTP request with a SUBSCRIBE HTTP
 * method.
 * @param {Object} headers - HTTP headers to include in the request.
 * @param {Function} callback - The function that fires after the subscription
 *     completes.
 */
Event.prototype.subscribeInternal = function(headers, callback) {
  var options = {};
  options.method = 'SUBSCRIBE';
  options.headers = headers;

  var that = this;
  this.request(options, function(error, res) {
    if (error) {
      callback(error, null);
      return;
    }

    // If the subscription is successful, store both the SID and timeout.
    var headers = res.headers;
    var data = {};
    if ('sid' in headers) {
      data.sid = that.sid = headers.sid;
    }
    if ('timeout' in headers) {
      // Parse the timeout value to ensure it is a number.
      var timeout = Event.parseTimeout(headers.timeout);
      if (!isNaN(timeout)) {
        data.timeout = that.timeout = timeout;
        if (that.autoRenew) {
          // Set a timeout to renew the subscription.
          that.timeoutId = Event.setTimeout(function() {
            that.renew();
          }, that.timeout * 1000);
        }
      }
    }
    callback(null, data);
  });
};

Event.prototype.unsubscribe = function(callback) {
  callback = callback || defaultCallback;

  if (!this.sid) {
    throw new Error('Must specify a SID.');
  }

  Logger.info('Unsubscribing speaker ' + this.speakerIp + ' with ' + 'SID ' +
      this.sid);

  var that = this;
  this.request({
    method: 'UNSUBSCRIBE',
    headers: {
      'SID': this.sid
    }
  }, function(err, data) {
    if (err) {
      callback(err, null);
    }
    if (that.timeoutId) {
      Event.clearTimeout(that.timeoutId);
    }
    that.timeoutId = null;
    that.timeout = null;
    that.sid = null;
    callback(null, data);
  });
};

Event.prototype.request = function(options, callback) {
  options.hostname = this.speakerIp;
  options.port = this.port;
  options.path = this.path;

  var successCallback = function(res) {
    var error = Event.getError(res);
    if (error) {
      return callback(error, null);
    }
    callback(null, res);
  };

  var errorCallback = function(e) {
    callback(e, null);
  };

  Event.request(options, successCallback, errorCallback);
};

module.exports = Event;
