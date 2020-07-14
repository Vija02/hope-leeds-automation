# Upload B2 Server

Running tusd piping the data to our B2 backend. This is going to be run using Docker on heroku. 

There's a tusd binary available in this repo that's compiled from https://github.com/Vija02/tusd. Takes too much effort to build from there so it's included here

# Running
The following env needs to be populated:

- BUCKET
- ENDPOINT
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION

All S3 Related (Well, B2)

# Build & Deployment 

`heroku container:push web -a tus-b2-server && heroku container:release web -a tus-b2-server`

# Setting up
Probably don't need to do this anymore

`heroku ps:scale web=1 -a tus-b2-server`