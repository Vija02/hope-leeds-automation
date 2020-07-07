# Hope Leeds Automation

This will be a monorepo containing all sorts of code to help automate the sunday service suring COVID-19.  
For guideline on editing the video, go [here](NON_TECH.md)

## Upload B2

Contains the frontend and companion to allow upload to B2 storage.  
On the server, we can access it using s3fs (mount FUSE) to make it easy.  
`s3fs hope-leeds-streaming /mnt/b2 -o passwd_file=/.passwd -o url=https://s3.us-west-000.backblazeb2.com -o use_path_request_style`

## Running the stream

There's a `streaming_command.js` file that helps to generate the ffmpeg command neccesary to play the stream.  
Some steps to take:
- Make sure ffmpeg is installed
- Get all the videos together
- Get the ffmpeg command we will run  (Edit video list & facebook stream key)
- Create a bash script to execute it
- Schedule to run the command at 2:10