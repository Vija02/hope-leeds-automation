const BackblazeB2Multipart = require('./backblaze-b2-multipart')
const Uppy = require('@uppy/core')
const Dashboard = require('@uppy/dashboard')

var uppy = Uppy()
  .use(Dashboard, {
    inline: true,
    target: 'body',
    plugins: ['BackblazeB2Multipart']
  })
  .use(BackblazeB2Multipart, {
    companionUrl: process.env.COMPANION_URL
  })