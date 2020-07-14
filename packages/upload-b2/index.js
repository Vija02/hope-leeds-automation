const Uppy = require('@uppy/core')
const Dashboard = require('@uppy/dashboard')
const Tus = require('@uppy/tus')

// DEBT: With our host, it's much easier to handle this here.
// Since Github pages & Heroku both allows either protocol
// Let's just enforce it https here, and also let the backend env to use https
if (location.protocol !== 'https:') {
	location.replace(`https:${location.href.substring(location.protocol.length)}`)
}

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
