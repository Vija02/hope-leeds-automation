const router = require('express').Router
const ms = require('ms')

module.exports = function s3 (config) {
  if (typeof config.acl !== 'string') {
    throw new TypeError('s3: The `acl` option must be a string')
  }
  if (typeof config.getKey !== 'function') {
    throw new TypeError('s3: The `getKey` option must be a function')
  }

  /**
   * Get upload paramaters for a simple direct upload.
   *
   * Expected query parameters:
   *  - filename - The name of the file, given to the `config.getKey`
   *    option to determine the object key name in the S3 bucket.
   *  - type - The MIME type of the file.
   *  - metadata - Key/value pairs configuring S3 metadata. Both must be ASCII-safe.
   *    Query parameters are formatted like `metadata[name]=value`.
   *
   * Response JSON:
   *  - method - The HTTP method to use to upload.
   *  - url - The URL to upload to.
   *  - fields - Form fields to send along.
   */
  function getUploadParameters (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const metadata = req.query.metadata || {}
    const key = config.getKey(req, req.query.filename, metadata)
    if (typeof key !== 'string') {
      return res.status(500).json({ error: 's3: filename returned from `getKey` must be a string' })
    }

    const fields = {
      acl: config.acl,
      key: key,
      success_action_status: '201',
      'content-type': req.query.type
    }

    Object.keys(metadata).forEach((key) => {
      fields[`x-amz-meta-${key}`] = metadata[key]
    })

    client.createPresignedPost({
      Bucket: config.bucket,
      Expires: ms('5 minutes') / 1000,
      Fields: fields,
      Conditions: config.conditions
    }, (err, data) => {
      if (err) {
        next(err)
        return
      }
      res.json({
        method: 'post',
        url: data.url,
        fields: data.fields
      })
    })
  }

  /**
   * Create an S3 multipart upload. With this, files can be uploaded in chunks of 5MB+ each.
   *
   * Expected JSON body:
   *  - filename - The name of the file, given to the `config.getKey`
   *    option to determine the object key name in the S3 bucket.
   *  - type - The MIME type of the file.
   *  - metadata - An object with the key/value pairs to set as metadata.
   *    Keys and values must be ASCII-safe for S3.
   *
   * Response JSON:
   *  - key - The object key in the S3 bucket.
   *  - uploadId - The ID of this multipart upload, to be used in later requests.
   */
  function createMultipartUpload (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const key = config.getKey(req, req.body.filename, req.body.metadata || {})
    const { type, metadata } = req.body
    if (typeof key !== 'string') {
      return res.status(500).json({ error: 's3: filename returned from `getKey` must be a string' })
    }
    if (typeof type !== 'string') {
      return res.status(400).json({ error: 's3: content type must be a string' })
    }

    client.createMultipartUpload({
      Bucket: config.bucket,
      Key: key,
      ACL: config.acl,
      ContentType: type,
      Metadata: metadata,
      Expires: ms('5 minutes') / 1000
    }, (err, data) => {
      if (err) {
        next(err)
        return
      }
      res.json({
        key: data.Key,
        uploadId: data.UploadId
      })
    })
  }

  /**
   * List parts that have been fully uploaded so far.
   *
   * Expected URL parameters:
   *  - uploadId - The uploadId returned from `createMultipartUpload`.
   * Expected query parameters:
   *  - key - The object key in the S3 bucket.
   * Response JSON:
   *  - An array of objects representing parts:
   *     - PartNumber - the index of this part.
   *     - ETag - a hash of this part's contents, used to refer to it.
   *     - Size - size of this part.
   */
  function getUploadedParts (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const { uploadId } = req.params
    const { key } = req.query

    if (typeof key !== 'string') {
      return res.status(400).json({ error: 's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"' })
    }

    let parts = []
    listPartsPage(0)

    function listPartsPage (startAt) {
      client.listParts({
        Bucket: config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: startAt
      }, (err, data) => {
        if (err) {
          next(err)
          return
        }

        parts = parts.concat(data.Parts)

        if (data.IsTruncated) {
          // Get the next page.
          listPartsPage(data.NextPartNumberMarker)
        } else {
          done()
        }
      })
    }

    function done () {
      res.json(parts)
    }
  }

  /**
   * Get parameters for uploading one part.
   *
   * Expected URL parameters:
   *  - uploadId - The uploadId returned from `createMultipartUpload`.
   *  - partNumber - This part's index in the file (1-10000).
   * Expected query parameters:
   *  - key - The object key in the S3 bucket.
   * Response JSON:
   *  - url - The URL to upload to, including signed query parameters.
   */
  function signPartUpload (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const { uploadId, partNumber } = req.params
    const { key } = req.query

    if (typeof key !== 'string') {
      return res.status(400).json({ error: 's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"' })
    }
    if (!parseInt(partNumber, 10)) {
      return res.status(400).json({ error: 's3: the part number must be a number between 1 and 10000.' })
    }

    client.getSignedUrl('uploadPart', {
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: '',
      Expires: ms('5 minutes') / 1000
    }, (err, url) => {
      if (err) {
        next(err)
        return
      }
      res.json({ url })
    })
  }

  /**
   * Abort a multipart upload, deleting already uploaded parts.
   *
   * Expected URL parameters:
   *  - uploadId - The uploadId returned from `createMultipartUpload`.
   * Expected query parameters:
   *  - key - The object key in the S3 bucket.
   * Response JSON:
   *   Empty.
   */
  function abortMultipartUpload (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const { uploadId } = req.params
    const { key } = req.query

    if (typeof key !== 'string') {
      return res.status(400).json({ error: 's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"' })
    }

    client.abortMultipartUpload({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId
    }, (err, data) => {
      if (err) {
        next(err)
        return
      }
      res.json({})
    })
  }

  /**
   * Complete a multipart upload, combining all the parts into a single object in the S3 bucket.
   *
   * Expected URL parameters:
   *  - uploadId - The uploadId returned from `createMultipartUpload`.
   * Expected query parameters:
   *  - key - The object key in the S3 bucket.
   * Expected JSON body:
   *  - parts - An array of parts, see the `getUploadedParts` response JSON.
   * Response JSON:
   *  - location - The full URL to the object in the S3 bucket.
   */
  function completeMultipartUpload (req, res, next) {
    // @ts-ignore The `companion` property is added by middleware before reaching here.
    const client = req.companion.s3Client
    const { uploadId } = req.params
    const { key } = req.query
    const { parts } = req.body

    if (typeof key !== 'string') {
      return res.status(400).json({ error: 's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"' })
    }
    if (!Array.isArray(parts) || !parts.every(isValidPart)) {
      return res.status(400).json({ error: 's3: `parts` must be an array of {ETag, PartNumber} objects.' })
    }

    client.completeMultipartUpload({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
      }
    }, (err, data) => {
      if (err) {
        next(err)
        return
      }
      res.json({
        location: data.Location
      })
    })
  }

  return router()
    .get('/params', getUploadParameters)
    .post('/multipart', createMultipartUpload)
    .get('/multipart/:uploadId', getUploadedParts)
    .get('/multipart/:uploadId/:partNumber', signPartUpload)
    .post('/multipart/:uploadId/complete', completeMultipartUpload)
    .delete('/multipart/:uploadId', abortMultipartUpload)
}

function isValidPart (part) {
  return part && typeof part === 'object' && typeof part.PartNumber === 'number' && typeof part.ETag === 'string'
}