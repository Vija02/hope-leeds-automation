const Uppy = require('@uppy/core')
const Dashboard = require('@uppy/dashboard')
const Tus = require('@uppy/tus')

var uppy = Uppy()
	.use(Dashboard, {
		inline: true,
		target: 'body',
	})
	.use(Tus, {
		endpoint: process.env.BACKEND_URL,
		resume: true,
		autoRetry: true,
		retryDelays: [ 0, 1000, 3000, 5000 ],
	})
