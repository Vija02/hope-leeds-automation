function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

var sha1 = require('js-sha1');

var MAX_PARTS_PER_UPLOAD = 10000;
var defaultOptions = {
  limit: 1,
  recommendedChunkSizeDivisor: 10,
  // default is 100MB (100MB / 10 = 10MB)
  onStart: function onStart() {},
  onProgress: function onProgress() {},
  onPartComplete: function onPartComplete() {},
  onSuccess: function onSuccess() {},
  onError: function onError(err) {
    throw err;
  }
};

function remove(arr, el) {
  var i = arr.indexOf(el);
  if (i !== -1) arr.splice(i, 1);
}

var B2Uploader =
/*#__PURE__*/
function () {
  function B2Uploader(file, options) {
    this.options = _extends({}, defaultOptions, {}, options);
    this.file = file;
    this.parts = this.options.parts || [];
    this.fileId = this.options.fileId; // Do `this.createdPromise.then(OP)` to execute an operation `OP` _only_ if the
    // upload was created already. That also ensures that the sequencing is right
    // (so the `OP` definitely happens if the upload is created).
    //
    // This mostly exists to make `_abortUpload` work well: only sending the abort request if
    // the upload was already created, and if the createMultipartUpload request is still in flight,
    // aborting it immediately after it finishes.

    this.createdPromise = Promise.reject(); // eslint-disable-line prefer-promise-reject-errors

    this.isPaused = false;
    this.chunks = null;
    this.chunkState = null;
    this.uploading = [];
    this.isMultiPart = this._initChunks(options.config);
    this.createdPromise.catch(function () {}); // silence uncaught rejection warning
  }
  /**
   * Take the file and slice it up into chunks, returns true if more than 1 chunks
   * were created (indicating a multi-part upload).
   */


  var _proto = B2Uploader.prototype;

  _proto._initChunks = function _initChunks(_ref) {
    var absoluteMinimumPartSize = _ref.absoluteMinimumPartSize,
        recommendedPartSize = _ref.recommendedPartSize;
    var chunks = [];
    var modifiedRecommendedPartSize = Math.ceil(recommendedPartSize / this.options.recommendedChunkSizeDivisor);
    var targetChunkSize = Math.max(absoluteMinimumPartSize, modifiedRecommendedPartSize);
    var chunkSize = Math.max(Math.ceil(this.file.size / MAX_PARTS_PER_UPLOAD), targetChunkSize);

    for (var i = 0; i < this.file.size; i += chunkSize) {
      var end = Math.min(this.file.size, i + chunkSize);
      chunks.push(this.file.slice(i, end));
    }

    this.chunks = chunks;
    this.chunkState = chunks.map(function () {
      return {
        uploaded: 0,
        busy: false,
        done: false
      };
    });
    return chunks.length > 1;
  }
  /**
   * Prepare a new file upload and begin sending.
   */
  ;

  _proto._createUpload = function _createUpload() {
    var _this = this;

    this.createdPromise = Promise.resolve().then(function () {
      if (_this.isMultiPart) {
        return _this.options.createMultipartUpload();
      } else {
        return {
          isMultiPart: false
        }; // single-part upload doesn't require cancellation
      }
    });
    return this.createdPromise.then(function (result) {
      if (_this.isMultiPart) {
        var valid = typeof result === 'object' && result && typeof result.fileId === 'string';

        if (!valid) {
          throw new TypeError('BackblazeB2/Multipart: Got incorrect result from `createMultipartUpload()`, expected an object `{ fileId }`.');
        }

        _this.fileId = result.fileId;
      }

      _this.options.onStart(result);

      _this._uploadParts();
    }).catch(function (err) {
      _this._onError(err);
    });
  }
  /**
   * Fetch a list of complete chunks from the server and set any matching
   * chunkStates to 'done' so Uppy knows they needn't be uploaded again.
   */
  ;

  _proto._resumeUpload = function _resumeUpload() {
    var _this2 = this;

    return this.options.listParts({
      fileId: this.fileId
    }).then(function (result) {
      var valid = typeof result === 'object' && result && typeof result.parts === 'object' && typeof result.parts.length === 'number';

      if (!valid) {
        throw new TypeError('BackblazeB2/Multipart: Got incorrect result from `listParts()`, expected an array `{ parts }`.');
      }

      result.parts.forEach(function (part) {
        var i = part.PartNumber - 1;
        _this2.chunkState[i] = {
          uploaded: part.Size,
          done: true
        }; // Only add if we did not yet know about this part.

        if (!_this2.parts.some(function (p) {
          return p.PartNumber === part.PartNumber;
        })) {
          _this2.parts.push({
            PartNumber: part.PartNumber
          });
        }
      });

      _this2._uploadParts();
    }).catch(function (err) {
      _this2._onError(err);
    });
  }
  /**
   * Queue up more chunks to be sent via _uploadPart(), and signal upload
   * completion if no incomplete chunks remain.
   */
  ;

  _proto._uploadParts = function _uploadParts() {
    var _this3 = this;

    var need = this.options.limit - this.uploading.length;
    if (need === 0) return; // All parts are uploaded.

    if (this.chunkState.every(function (state) {
      return state.done;
    })) {
      this._completeUpload();

      return;
    }

    var candidates = [];

    for (var i = 0; i < this.chunkState.length; i++) {
      var state = this.chunkState[i];
      if (state.done || state.busy) continue;
      candidates.push(i);

      if (candidates.length >= need) {
        break;
      }
    }

    candidates.forEach(function (index) {
      _this3._uploadPart(index);
    });
  }
  /**
   * Acquires an endpoint as well as the SHA1 checksum of the part, then pass
   * everything to _uploadPartBytes() for transmission.
   */
  ;

  _proto._uploadPart = function _uploadPart(index) {
    var _this4 = this;

    this.chunkState[index].busy = true; // Ensure the sha1 has been calculated for this part

    if (typeof this.chunkState[index].sha1 === 'undefined') {
      this.chunkState[index].sha1 = this._getPartSha1Sum(index);
    }

    var sha1 = this.chunkState[index].sha1;

    var endpoint = this._endpointAcquire();

    return Promise.all([endpoint, sha1]).then(function (_ref2) {
      var endpoint = _ref2[0],
          sha1 = _ref2[1];
      return _this4._uploadPartBytes(index, endpoint, sha1);
    }, function (err) {
      return _this4._onError(err);
    });
  }
  /**
   * Create and begin the actual XHR request for transmitting file data
   * to the Backblaze endpoint.
   */
  ;

  _proto._uploadPartBytes = function _uploadPartBytes(index, endpoint, sha1) {
    var _this5 = this;

    var body = this.chunks[index];
    var xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint.uploadUrl, true);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Authorization', endpoint.authorizationToken);
    xhr.setRequestHeader('Content-Length', body.size);
    xhr.setRequestHeader('X-Bz-Content-Sha1', sha1);

    if (this.isMultiPart) {
      xhr.setRequestHeader('X-Bz-Part-Number', index + 1);
    } else {
      xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(this.file.name));
      xhr.setRequestHeader('Content-Type', this.file.type || 'b2/x-auto');
    }

    this.uploading.push(xhr);
    xhr.upload.addEventListener('progress', function (ev) {
      if (!ev.lengthComputable) return;

      _this5._onPartProgress(index, ev.loaded, ev.total);
    });
    xhr.addEventListener('abort', function (ev) {
      remove(_this5.uploading, ev.target);
      _this5.chunkState[index].busy = false;

      _this5._endpointRelease(endpoint);
    });
    xhr.addEventListener('load', function (ev) {
      remove(_this5.uploading, ev.target);
      _this5.chunkState[index].busy = false; // Check for http error response

      if (ev.target.status < 200 || ev.target.status >= 300) {
        // If 503, then we need to retry this part.
        // We've already set it to busy=false, so
        // bailing out here means the part will eventually
        // be retried. (Discard the endpoint)
        if (ev.target.status === 503) {
          _this5._uploadParts();

          return;
        }

        _this5._onError(new Error('Non 2xx'));

        return;
      } // Grab the resulting fileId if this was a single part upload


      if (typeof _this5.fileId === 'undefined') {
        if (!ev.target.response || !ev.target.response.fileId) {
          _this5._onError(new Error('Failed to obtain fileId from upload response'));
        }

        _this5.fileId = ev.target.response.fileId;
      }

      _this5._onPartProgress(index, body.size, body.size);

      _this5._endpointRelease(endpoint);

      _this5._onPartComplete(index);
    });
    xhr.addEventListener('error', function (ev) {
      remove(_this5.uploading, ev.target);
      _this5.chunkState[index].busy = false;
      var error = new Error('Unknown error');
      error.source = ev.target;

      _this5._onError(error);
    });
    xhr.send(body);
  }
  /**
   * Calculate the sha1 checksum for the part at `index`
   */
  ;

  _proto._getPartSha1Sum = function _getPartSha1Sum(index) {
    var body = this.chunks[index];
    var hash = sha1.create();
    var chunkState = this.chunkState[index];
    return new Promise(function (resolve, reject) {
      var fileReader = new FileReader();

      fileReader.onload = function (event) {
        hash.update(event.target.result);
        chunkState.sha1 = hash.hex();
        resolve(chunkState.sha1);
      };

      fileReader.readAsArrayBuffer(body);
    });
  }
  /**
   * Acquire an appropriate endpoint from the pool
   * or request a new one from Companion.
   */
  ;

  _proto._endpointAcquire = function _endpointAcquire() {
    var _this6 = this;

    return new Promise(function (resolve, reject) {
      var endpoint;

      if (_this6.isMultiPart) {
        if (typeof _this6.partEndpointPool === 'undefined') {
          _this6.partEndpointPool = [];
        }

        endpoint = _this6.partEndpointPool.pop();
      } else {
        endpoint = _this6.options.sharedEndpointPool.pop();
      }

      if (endpoint) {
        resolve(endpoint);
      } else {
        _this6.options.getEndpoint(_this6.isMultiPart && _this6.fileId).then(function (endpoint) {
          return resolve(endpoint);
        }).catch(function (err) {
          return reject(err);
        });
      }
    });
  }
  /**
   * Release an endpoint that has not encountered any upload errors
   * back into the appropriate endpoint pool.
   */
  ;

  _proto._endpointRelease = function _endpointRelease(endpoint) {
    if (endpoint.fileId) {
      this.partEndpointPool.push(endpoint);
    } else {
      this.options.sharedEndpointPool.push(endpoint);
    }
  };

  _proto._onPartProgress = function _onPartProgress(index, sent, total) {
    this.chunkState[index].uploaded = sent;
    var totalUploaded = this.chunkState.reduce(function (n, c) {
      return n + c.uploaded;
    }, 0);
    this.options.onProgress(totalUploaded, this.file.size);
  };

  _proto._onPartComplete = function _onPartComplete(index) {
    this.chunkState[index].done = true;
    var part = {
      PartNumber: index + 1
    };
    this.parts.push(part);
    this.options.onPartComplete(part);

    this._uploadParts();
  };

  _proto._completeUpload = function _completeUpload() {
    var _this7 = this;

    // Parts may not have completed uploading in sorted order, if limit > 1.
    this.parts.sort(function (a, b) {
      return a.PartNumber - b.PartNumber;
    }); // Build part sha1 checksum array

    var sha1Sums = Promise.all(this.chunkState.map(function (chunkState) {
      return chunkState.sha1;
    }));
    sha1Sums.then(function (partSha1Array) {
      if (_this7.isMultiPart) {
        return _this7.options.completeMultipartUpload({
          fileId: _this7.fileId,
          parts: _this7.parts,
          partSha1Array: partSha1Array
        });
      } else {
        return sha1Sums.then(function (contentSha1) {
          return {
            fileId: _this7.fileId,
            contentSha1: contentSha1
          };
        });
      }
    }).then(function (result) {
      _this7.options.onSuccess(result);
    }, function (err) {
      _this7._onError(err);
    });
  };

  _proto._abortUpload = function _abortUpload() {
    var _this8 = this;

    this.uploading.slice().forEach(function (xhr) {
      xhr.abort();
    });
    this.createdPromise.then(function () {
      if (_this8.isMultiPart) {
        return _this8.options.abortMultipartUpload({
          fileId: _this8.fileId
        });
      }
    }, function () {// if the creation failed we do not need to abort
    });
    this.uploading = [];
  };

  _proto._onError = function _onError(err) {
    this.options.onError(err);
  };

  _proto.start = function start() {
    this.isPaused = false;

    if (this.isMultiPart && this.fileId) {
      this._resumeUpload();
    } else {
      this._createUpload();
    }
  };

  _proto.pause = function pause() {
    var inProgress = this.uploading.slice();
    inProgress.forEach(function (xhr) {
      xhr.abort();
    });
    this.isPaused = true;
  };

  _proto.abort = function abort(opts) {
    if (opts === void 0) {
      opts = {};
    }

    var really = opts.really || false;

    if (!really) {
      return this.pause();
    }

    return this._abortUpload();
  };

  return B2Uploader;
}();

module.exports = B2Uploader;