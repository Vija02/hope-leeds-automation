var _class, _temp;

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

var _require = require('@uppy/core'),
    Plugin = _require.Plugin;

var _require2 = require('@uppy/companion-client'),
    Socket = _require2.Socket,
    Provider = _require2.Provider,
    RequestClient = _require2.RequestClient;

var EventTracker = require('@uppy/utils/lib/EventTracker');

var emitSocketProgress = require('@uppy/utils/lib/emitSocketProgress');

var getSocketHost = require('@uppy/utils/lib/getSocketHost');

var RateLimitedQueue = require('@uppy/utils/lib/RateLimitedQueue');

var Uploader = require('./B2Uploader');

function assertServerError(res) {
  if (res && res.error) {
    var error = new Error(res.message);

    _extends(error, res.error);

    throw error;
  }

  return res;
}

module.exports = (_temp = _class =
/*#__PURE__*/
function (_Plugin) {
  _inheritsLoose(BackblazeB2Multipart, _Plugin);

  function BackblazeB2Multipart(uppy, opts) {
    var _this;

    _this = _Plugin.call(this, uppy, opts) || this;
    _this.type = 'uploader';
    _this.id = _this.opts.id || 'BackblazeB2Multipart';
    _this.title = 'Backblaze B2 Multipart';
    _this.client = new RequestClient(uppy, opts);
    _this.sharedEndpointPool = [];
    var defaultOptions = {
      timeout: 30 * 1000,
      limit: 0,
      createMultipartUpload: _this.createMultipartUpload.bind(_assertThisInitialized(_this)),
      getEndpoint: _this.getEndpoint.bind(_assertThisInitialized(_this)),
      listParts: _this.listParts.bind(_assertThisInitialized(_this)),
      abortMultipartUpload: _this.abortMultipartUpload.bind(_assertThisInitialized(_this)),
      completeMultipartUpload: _this.completeMultipartUpload.bind(_assertThisInitialized(_this))
    };
    _this.opts = _extends({}, defaultOptions, {}, opts);
    _this.upload = _this.upload.bind(_assertThisInitialized(_this));
    _this.requests = new RateLimitedQueue(_this.opts.limit);
    _this.uploaders = Object.create(null);
    _this.uploaderEvents = Object.create(null);
    _this.uploaderSockets = Object.create(null);
    return _this;
  }
  /**
   * Clean up all references for a file's upload: the MultipartUploader instance,
   * any events related to the file, and the Companion WebSocket connection.
   *
   * Set `opts.abort` to tell b2 that the multipart upload is cancelled and must be removed.
   * This should be done when the user cancels the upload, not when the upload is completed or errored.
   */


  var _proto = BackblazeB2Multipart.prototype;

  _proto.resetUploaderReferences = function resetUploaderReferences(fileID, opts) {
    if (opts === void 0) {
      opts = {};
    }

    if (this.uploaders[fileID]) {
      this.uploaders[fileID].abort({
        really: opts.abort || false
      });
      this.uploaders[fileID] = null;
    }

    if (this.uploaderEvents[fileID]) {
      this.uploaderEvents[fileID].remove();
      this.uploaderEvents[fileID] = null;
    }

    if (this.uploaderSockets[fileID]) {
      this.uploaderSockets[fileID].close();
      this.uploaderSockets[fileID] = null;
    }
  };

  _proto.assertHost = function assertHost() {
    if (!this.opts.companionUrl) {
      throw new Error('Expected a `companionUrl` option containing a Companion address.');
    }
  } // Get recommended chunk size, etc. from Companion
  ;

  _proto.getConfig = function getConfig() {
    var _this2 = this;

    if (this._config) {
      return this._config;
    } else {
      this._config = this.client.get('b2/config').catch(function (err) {
        delete _this2._config;
        return assertServerError(err);
      });
    }

    return this._config;
  };

  _proto.createMultipartUpload = function createMultipartUpload(file) {
    this.assertHost();
    var metadata = {};
    Object.keys(file.meta).forEach(function (key) {
      if (file.meta[key] != null) {
        metadata[key] = file.meta[key].toString();
      }
    });
    return this.client.post('b2/multipart', {
      filename: file.name,
      type: file.type,
      metadata: metadata
    }).then(assertServerError);
  };

  _proto.getEndpoint = function getEndpoint(file, fileId) {
    this.assertHost();
    return (fileId ? this.client.get("b2/multipart/" + fileId + "/endpoint") : this.client.get('b2/endpoint')).then(assertServerError);
  };

  _proto.listParts = function listParts(file, _ref) {
    var fileId = _ref.fileId;
    this.assertHost();
    return this.client.get("b2/multipart/" + fileId).then(assertServerError);
  };

  _proto.completeMultipartUpload = function completeMultipartUpload(file, _ref2) {
    var fileId = _ref2.fileId,
        parts = _ref2.parts,
        partSha1Array = _ref2.partSha1Array;
    this.assertHost();
    return this.client.post("b2/multipart/" + fileId + "/complete", {
      partSha1Array: partSha1Array
    }).then(assertServerError);
  };

  _proto.abortMultipartUpload = function abortMultipartUpload(file, _ref3) {
    var fileId = _ref3.fileId;
    this.assertHost();
    return this.client.delete("b2/multipart/" + fileId).then(assertServerError);
  };

  _proto.uploadFile = function uploadFile(file) {
    var _this3 = this;

    this.getConfig().then(function (config) {
      return new Promise(function (resolve, reject) {
        var onStart = function onStart(data) {
          var cFile = _this3.uppy.getFile(file.id);

          _this3.uppy.setFileState(file.id, {
            b2Multipart: _extends({}, cFile.b2Multipart, {
              fileId: data.fileId,
              parts: []
            })
          });
        };

        var onProgress = function onProgress(bytesUploaded, bytesTotal) {
          _this3.uppy.emit('upload-progress', file, {
            uploader: _this3,
            bytesUploaded: bytesUploaded,
            bytesTotal: bytesTotal
          });
        };

        var onError = function onError(err) {
          _this3.uppy.log(err);

          _this3.uppy.emit('upload-error', file, err);

          err.message = "Failed because: " + err.message;
          queuedRequest.done();

          _this3.resetUploaderReferences(file.id);

          reject(err);
        };

        var onSuccess = function onSuccess(result) {
          var uploadResp = _extends({}, result, {
            fileId: result.fileId || _this3.fileId
          });

          queuedRequest.done();

          _this3.resetUploaderReferences(file.id);

          _this3.uppy.emit('upload-success', file, uploadResp);

          if (result.location) {
            _this3.uppy.log('Download ' + upload.file.name + ' from ' + result.location);
          }

          resolve(upload);
        };

        var onPartComplete = function onPartComplete(part) {
          // Store completed parts in state.
          var cFile = _this3.uppy.getFile(file.id);

          if (!cFile) {
            return;
          }

          _this3.uppy.setFileState(file.id, {
            b2Multipart: _extends({}, cFile.b2Multipart, {
              parts: [].concat(cFile.b2Multipart.parts, [part])
            })
          });

          _this3.uppy.emit('b2-multipart:part-uploaded', cFile, part);
        };

        var upload = new Uploader(file.data, _extends({
          // .bind to pass the file object to each handler.
          createMultipartUpload: _this3.opts.createMultipartUpload.bind(_this3, file),
          listParts: _this3.opts.listParts.bind(_this3, file),
          completeMultipartUpload: _this3.opts.completeMultipartUpload.bind(_this3, file),
          abortMultipartUpload: _this3.opts.abortMultipartUpload.bind(_this3, file),
          getEndpoint: _this3.opts.getEndpoint.bind(_this3, file),
          onStart: onStart,
          onProgress: onProgress,
          onError: onError,
          onSuccess: onSuccess,
          onPartComplete: onPartComplete,
          config: config,
          sharedEndpointPool: _this3.sharedEndpointPool,
          limit: _this3.opts.limit || 5
        }, file.b2Multipart));
        _this3.uploaders[file.id] = upload;
        _this3.uploaderEvents[file.id] = new EventTracker(_this3.uppy);

        var queuedRequest = _this3.requests.run(function () {
          if (!file.isPaused) {
            upload.start();
          } // Don't do anything here, the caller will take care of cancelling the upload itself
          // using resetUploaderReferences(). This is because resetUploaderReferences() has to be
          // called when this request is still in the queue, and has not been started yet, too. At
          // that point this cancellation function is not going to be called.


          return function () {};
        });

        _this3.onFileRemove(file.id, function (removed) {
          queuedRequest.abort();

          _this3.resetUploaderReferences(file.id, {
            abort: true
          });

          resolve("upload " + removed.id + " was removed");
        });

        _this3.onCancelAll(file.id, function () {
          queuedRequest.abort();

          _this3.resetUploaderReferences(file.id, {
            abort: true
          });

          resolve("upload " + file.id + " was canceled");
        });

        _this3.onFilePause(file.id, function (isPaused) {
          if (isPaused) {
            // Remove this file from the queue so another file can start in its place.
            queuedRequest.abort();
            upload.pause();
          } else {
            // Resuming an upload should be queued, else you could pause and then resume a queued upload to make it skip the queue.
            queuedRequest.abort();
            queuedRequest = _this3.requests.run(function () {
              upload.start();
              return function () {};
            });
          }
        });

        _this3.onPauseAll(file.id, function () {
          queuedRequest.abort();
          upload.pause();
        });

        _this3.onResumeAll(file.id, function () {
          queuedRequest.abort();

          if (file.error) {
            upload.abort();
          }

          queuedRequest = _this3.requests.run(function () {
            upload.start();
            return function () {};
          });
        });

        if (!file.isRestored) {
          _this3.uppy.emit('upload-started', file, upload);
        }
      });
    });
  };

  _proto.uploadRemote = function uploadRemote(file) {
    var _this4 = this;

    this.resetUploaderReferences(file.id);
    this.uppy.emit('upload-started', file);

    if (file.serverToken) {
      return this.connectToServerSocket(file);
    }

    return new Promise(function (resolve, reject) {
      var Client = file.remote.providerOptions.provider ? Provider : RequestClient;
      var client = new Client(_this4.uppy, file.remote.providerOptions);
      client.post(file.remote.url, _extends({}, file.remote.body, {
        protocol: 'b2-multipart',
        size: file.data.size,
        metadata: file.meta
      })).then(function (res) {
        _this4.uppy.setFileState(file.id, {
          serverToken: res.token
        });

        file = _this4.uppy.getFile(file.id);
        return file;
      }).then(function (file) {
        return _this4.connectToServerSocket(file);
      }).then(function () {
        resolve();
      }).catch(function (err) {
        reject(new Error(err));
      });
    });
  };

  _proto.connectToServerSocket = function connectToServerSocket(file) {
    var _this5 = this;

    return new Promise(function (resolve, reject) {
      var token = file.serverToken;
      var host = getSocketHost(file.remote.companionUrl);
      var socket = new Socket({
        target: host + "/api/" + token,
        autoOpen: false
      });
      _this5.uploaderSockets[file.id] = socket;
      _this5.uploaderEvents[file.id] = new EventTracker(_this5.uppy);

      _this5.onFileRemove(file.id, function (removed) {
        queuedRequest.abort();
        socket.send('pause', {});

        _this5.resetUploaderReferences(file.id, {
          abort: true
        });

        resolve("upload " + file.id + " was removed");
      });

      _this5.onFilePause(file.id, function (isPaused) {
        if (isPaused) {
          // Remove this file from the queue so another file can start in its place.
          queuedRequest.abort();
          socket.send('pause', {});
        } else {
          // Resuming an upload should be queued, else you could pause and then resume a queued upload to make it skip the queue.
          queuedRequest.abort();
          queuedRequest = _this5.requests.run(function () {
            socket.send('resume', {});
            return function () {};
          });
        }
      });

      _this5.onPauseAll(file.id, function () {
        queuedRequest.abort();
        socket.send('pause', {});
      });

      _this5.onCancelAll(file.id, function () {
        queuedRequest.abort();
        socket.send('pause', {});

        _this5.resetUploaderReferences(file.id);

        resolve("upload " + file.id + " was canceled");
      });

      _this5.onResumeAll(file.id, function () {
        queuedRequest.abort();

        if (file.error) {
          socket.send('pause', {});
        }

        queuedRequest = _this5.requests.run(function () {
          socket.send('resume', {});
        });
      });

      _this5.onRetry(file.id, function () {
        // Only do the retry if the upload is actually in progress;
        // else we could try to send these messages when the upload is still queued.
        // We may need a better check for this since the socket may also be closed
        // for other reasons, like network failures.
        if (socket.isOpen) {
          socket.send('pause', {});
          socket.send('resume', {});
        }
      });

      _this5.onRetryAll(file.id, function () {
        if (socket.isOpen) {
          socket.send('pause', {});
          socket.send('resume', {});
        }
      });

      socket.on('progress', function (progressData) {
        return emitSocketProgress(_this5, progressData, file);
      });
      socket.on('error', function (errData) {
        _this5.uppy.emit('upload-error', file, new Error(errData.error));

        _this5.resetUploaderReferences(file.id);

        queuedRequest.done();
        reject(new Error(errData.error));
      });
      socket.on('success', function (data) {
        var uploadResp = {
          uploadURL: data.url
        };

        _this5.uppy.emit('upload-success', file, uploadResp);

        _this5.resetUploaderReferences(file.id);

        queuedRequest.done();
        resolve();
      });

      var queuedRequest = _this5.requests.run(function () {
        socket.open();

        if (file.isPaused) {
          socket.send('pause', {});
        }

        return function () {};
      });
    });
  };

  _proto.upload = function upload(fileIDs) {
    var _this6 = this;

    if (fileIDs.length === 0) return Promise.resolve();
    var promises = fileIDs.map(function (id) {
      var file = _this6.uppy.getFile(id);

      if (file.isRemote) {
        return _this6.uploadRemote(file);
      }

      return _this6.uploadFile(file);
    });
    return Promise.all(promises);
  };

  _proto.onFileRemove = function onFileRemove(fileID, cb) {
    this.uploaderEvents[fileID].on('file-removed', function (file) {
      if (fileID === file.id) cb(file.id);
    });
  };

  _proto.onFilePause = function onFilePause(fileID, cb) {
    this.uploaderEvents[fileID].on('upload-pause', function (targetFileID, isPaused) {
      if (fileID === targetFileID) {
        // const isPaused = this.uppy.pauseResume(fileID)
        cb(isPaused);
      }
    });
  };

  _proto.onRetry = function onRetry(fileID, cb) {
    this.uploaderEvents[fileID].on('upload-retry', function (targetFileID) {
      if (fileID === targetFileID) {
        cb();
      }
    });
  };

  _proto.onRetryAll = function onRetryAll(fileID, cb) {
    var _this7 = this;

    this.uploaderEvents[fileID].on('retry-all', function (filesToRetry) {
      if (!_this7.uppy.getFile(fileID)) return;
      cb();
    });
  };

  _proto.onPauseAll = function onPauseAll(fileID, cb) {
    var _this8 = this;

    this.uploaderEvents[fileID].on('pause-all', function () {
      if (!_this8.uppy.getFile(fileID)) return;
      cb();
    });
  };

  _proto.onCancelAll = function onCancelAll(fileID, cb) {
    var _this9 = this;

    this.uploaderEvents[fileID].on('cancel-all', function () {
      if (!_this9.uppy.getFile(fileID)) return;
      cb();
    });
  };

  _proto.onResumeAll = function onResumeAll(fileID, cb) {
    var _this10 = this;

    this.uploaderEvents[fileID].on('resume-all', function () {
      if (!_this10.uppy.getFile(fileID)) return;
      cb();
    });
  };

  _proto.install = function install() {
    var _this$uppy$getState = this.uppy.getState(),
        capabilities = _this$uppy$getState.capabilities;

    this.uppy.setState({
      capabilities: _extends({}, capabilities, {
        resumableUploads: true
      })
    });
    this.uppy.addUploader(this.upload);
  };

  _proto.uninstall = function uninstall() {
    var _this$uppy$getState2 = this.uppy.getState(),
        capabilities = _this$uppy$getState2.capabilities;

    this.uppy.setState({
      capabilities: _extends({}, capabilities, {
        resumableUploads: false
      })
    });
    this.uppy.removeUploader(this.upload);
  };

  return BackblazeB2Multipart;
}(Plugin), _class.VERSION = require('../package.json').version, _temp);