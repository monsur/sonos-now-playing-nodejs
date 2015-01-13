var Logger = require('little-logger').Logger;

var timeoutPrefix = 'Second-';
var eventPath = '/MediaRenderer/AVTransport/Event';
var defaultTimeout = 43200000;
var defaultCallback = function() {};

var statusCodeMessages = {
  400: 'Incompatible header fields',
  412: 'Precondition failed',
  500: 'Unable to accept renewal'
};

var getError = function(res) {
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

var parseTimeout = function(val) {
  return parseInt(val.substr(timeoutPrefix.length));
};

var SubscriptionController = function(speakerIp, port, logger, request) {
  this.speakerIp = speakerIp;
  this.port = port;
  this.logger = logger || new Logger(null, {enabled: false});
  this.request = request || require('http').request;
};

SubscriptionController.prototype.subscribe = function(callbackUrl, callback) {
  callback = callback || defaultCallback;
  if (!callbackUrl) {
    return callback(new Error('Must specify a callback URL.'), null);
  }

  this.logger.info('Subscribing to speaker ' + this.speakerIp + ' with ' +
      'callback URL ' + callbackUrl);

  this.subscribeInternal({
    'CALLBACK': '<' + callbackUrl + '>',
    'NT': 'upnp:event'
  }, callback);
};

SubscriptionController.prototype.renew = function(sid, timeout, callback) {
  callback = callback || defaultCallback;
  if (!sid) {
    return callback(new Error('Must specify a SID.'), null);
  }
  if (arguments.length === 2) {
    callback = timeout;
    if (typeof callback !== 'function') {
      callback = defaultCallback;
    }
    timeout = null;
  } else if (typeof timeout !== 'number') {
    return callback(new Error('Timeout must be a number.'), null);
  }
  timeout = timeout || defaultTimeout;

  this.logger.info('Renewing speaker ' + this.speakerIp + ' with ' +
      'SID ' + sid + ' and timeout ' + timeout);

  this.subscribeInternal({
    'SID': sid,
    'TIMEOUT': timeoutPrefix + defaultTimeout
  }, callback);
};

SubscriptionController.prototype.subscribeInternal = function(headers, callback) {
  var options = {};
  options.method = 'SUBSCRIBE';
  options.path = eventPath;
  options.headers = headers;

  this.makeRequest(options, function(error, res) {
    if (error) {
      callback(error, null);
      return;
    }

    var headers = res.headers;
    var data = {};
    if ('sid' in headers) {
      data.sid = headers.sid;
    }
    if ('timeout' in headers) {
      var timeout = parseTimeout(headers.timeout);
      if (!isNaN(timeout)) {
        data.timeout = timeout;
      }
    }
    callback(null, data);
  });
};

SubscriptionController.prototype.unsubscribe = function(sid, callback) {
  callback = callback || defaultCallback;
  if (!sid) {
    return callback(new Error('Must specify a SID.'), null);
  }

  this.logger.info('Unsubscribing speaker ' + this.speakerIp + ' with ' +
      'SID ' + sid);

  this.makeRequest({
    method: 'UNSUBSCRIBE',
    path: eventPath,
    headers: {
      'SID': sid
    }
  }, callback);
};

SubscriptionController.prototype.makeRequest = function(options, callback) {
  var that = this;
  options.hostname = this.speakerIp;
  options.port = this.port;
  var req = this.request(options, function(res) {
    var error = getError(res);
    if (error) {
      return callback(error, null);
    }
    callback(null, res);
  });
  req.on('error', function(e) {
    that.logger.error(e.message);
  });
  req.end();
};

module.exports = SubscriptionController;
