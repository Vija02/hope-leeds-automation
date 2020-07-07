# Hope Leeds Automation

This will be a monorepo containing all sorts of code to help automate the sunday service suring COVID-19.  
For guideline on editing the video, go [here](NON_TECH.md)

## Upload B2

Contains the frontend and companion to allow upload to B2 storage.  
On the server, we can access it using s3fs (mount FUSE) to make it easy.  
`s3fs hope-leeds-streaming /mnt/b2 -o passwd_file=/.passwd -o url=https://s3.us-west-000.backblazeb2.com -o use_path_request_style`

## Running the stream
