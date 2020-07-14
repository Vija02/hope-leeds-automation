const Uppy = require('@uppy/core')
const Dashboard = require('@uppy/dashboard')
const Tus = require('@uppy/tus')

// DEBT: With our host, it's much easier to handle this here.
// Since Github pages & Heroku both allows either protocol
// Let's just enforce it http here, and also let the backend env to use http
// IDK why but using https worked at first but eventually it points to http for the backend
if (location.protocol !== 'http:') {
	location.replace(`http:${location.href.substring(location.protocol.length)}`)
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
