const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')
const companion = require('./companion/lib/companion')
const app = require('express')()

const DATA_DIR = path.join(__dirname, 'tmp')

app.use(require('cors')({
  origin: true,
  credentials: true
}))
app.use(require('cookie-parser')())
app.use(require('body-parser').json())
app.use(require('express-session')({
  secret: 'ikajnksjn'
}))

const options = {
  providerOptions: {
    b2: {
      getPath: (req, filename) => `${Math.random().toString(32).slice(2)}/${filename}`,
      key: process.env.B2_KEY,
      secret: process.env.B2_SECRET,
      bucket: process.env.B2_BUCKET,
      axios: {} // pass custom axios options to backblaze-b2 client
    }
  },
  server: { host: process.env.COMPANION_URL },
  limit: 8,
  filePath: DATA_DIR,
  secret: 'b78236tn',
  debug: true
}

// Create the data directory here for the sake of the example.
try {
  fs.accessSync(DATA_DIR)
} catch (err) {
  fs.mkdirSync(DATA_DIR)
}
process.on('exit', function () {
  rimraf.sync(DATA_DIR)
})

app.get('/', (req, res) => {
  res.send("Hello~")
})

app.use(companion.app(options))

const port = process.env.PORT || 8000
const server = app.listen(port, () => {
  console.log(`listening on port ${port}`)
})

companion.socket(server, options)
