const router = require('express').Router

module.exports = function b2 (config) {
  if (typeof config.getPath !== 'function') {
    throw new TypeError('b2: the `getPath` option must be a function')
  }

  /**
   * Initiate a B2 large file upload.
   *
   * Expected JSON body:
   *  - filename - The name of the file, given to the `config.getPath`
   *    option to determine the object's final path in the B2 bucket.
   *  - type - The MIME type of the file
   *
   * Response JSON:
   *  - fileId - The unique B2 fileId which will be used again to initiate
   *    the actual file transfer.
   */
  function createMultipartUpload (req, res, next) {
    const client = req.uppy.b2Client
    const fileName = config.getPath(req, req.body.filename)
    const { type } = req.body

    if (typeof fileName !== 'string') {
      return res.status(500).json({ error: 'b2: filename returned from `getPath` must be a string' })
    }
    if (typeof type !== 'string') {
      return res.status(400).json({ error: 'b2: content type must be a string' })
    }

    return client.getCachedBucket(config.bucket)
      .then(({ bucketId }) =>
        client.startLargeFile({
          bucketId,
          fileName,
          contentType: type
        }))
      .then(largeFileResponse => ({
        fileId: largeFileResponse.data.fileId
      }))
      .then((data) => {
        res.json(data)
      })
      .catch(err => next(err))
  }

  /**
   * Obtain an authorization token and destination URL to
   * post upload data to.
   *
   * Expected JSON body:
   *  - fileId - The B2 fileId we would like to obtain an
   *    upload destination for.
   *
   * Response JSON:
   *  - fileId - The unique fileId of file being uploaded
   *    (should be same as passed-in fileId)
   *  - uploadUrl - The Backblaze URL which we'll send file
   *    parts to
   *  - authorizationToken - Auth token for uploading to the
   *    aforementioned uploadUrl.
   */
  function getMultipartEndpoint (req, res, next) {
    const client = req.uppy.b2Client
    const { fileId } = req.params

    client.getUploadPartUrl({ fileId })
      .then(response => res.json(response.data))
      .catch(err => next(err))
  }

  /**
   * Obtain a B2 upload URL associated with the configured
   * bucket. Note that this is not to be used with large
   * (multipart) uploads.
   */
  function getEndpoint (req, res, next) {
    const client = req.uppy.b2Client

    return client.getCachedBucket(config.bucket)
      .then(({ bucketId }) =>
        client.getUploadUrl({
          bucketId
        }).then(response => {
          const { authorizationToken, uploadUrl } = response.data
          res.json({ authorizationToken, uploadUrl })
        }).catch(err => next(err))
      )
  }

  function getUploadedParts (req, res, next) {
    const client = req.uppy.b2Client
    const { fileId } = req.params

    const fetchParts = (prevParts = [], nextPartNumber) => {
      const params = {
        fileId,
        maxPartCount: 1000
      }
      if (nextPartNumber) {
        params.nextPartNumber = nextPartNumber
      }
      return client.listParts(params)
        .then(({ data }) => {
          const parts = [
            ...prevParts,
            ...((data.parts || []).map(part => ({
              PartNumber: part.partNumber,
              Size: part.contentLength
            }))
            )
          ]

          if (data.nextPartNumber) {
            return fetchParts(parts, data.nextPartNumber)
          } else {
            return Promise.resolve(parts)
          }
        })
    }

    fetchParts()
      .then(parts => res.json({ parts }))
      .catch(err => next(err))
  }

  /**
   * Finish off a multipart upload.
   *
   * Expected JSON body:
   *  - fileId - The unique fileId of the file being uploaded
   *  - partSha1Array - An array containing the hex digests of
   *    each of the uploaded parts (in order). This is used on
   *    the receiving end to verify the integrity of the upload.
   *
   * Response JSON:
   *  see https://www.backblaze.com/b2/docs/b2_finish_large_file.html
   */
  function completeMultipartUpload (req, res, next) {
    const client = req.uppy.b2Client
    const { partSha1Array } = req.body
    const { fileId } = req.params

    if (typeof partSha1Array === 'undefined' || typeof partSha1Array.length !== 'number') {
      return res.status(400).json({ error: 'b2: partSha1Array array not found' })
    }

    client.finishLargeFile({ fileId, partSha1Array })
      .then(({ data }) => res.json(data))
      .catch(err => next(err))
  }

  function abortMultipartUpload (req, res, next) {
    const client = req.uppy.b2Client
    const { fileId } = req.params

    client.cancelLargeFile({ fileId })
      .then(({ data }) => res.json({
        fileId: data.fileId,
        fileName: data.fileName
      }))
      .catch(err => next(err))
  }

  function getUploadConfig (req, res, next) {
    const client = req.uppy.b2Client

    client.preauth()
      .then(data => {
        const { recommendedPartSize, absoluteMinimumPartSize } = data
        res.json({ recommendedPartSize, absoluteMinimumPartSize })
      })
      .catch(err => next(err))
  }

  return router()
    .get('/config', getUploadConfig)
    .get('/endpoint', getEndpoint)
    .post('/multipart', createMultipartUpload)
    .get('/multipart/:fileId/endpoint', getMultipartEndpoint)
    .get('/multipart/:fileId', getUploadedParts)
    .post('/multipart/:fileId/complete', completeMultipartUpload)
    .delete('/multipart/:fileId', abortMultipartUpload)
}
